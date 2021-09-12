import { BaseRpcMessage, MessageDirection, PacketDecoder } from "@skeldjs/protocol";
import { HazelReader, HazelWriter } from "@skeldjs/util";

import { BaseReactorRpcMessage } from "../api";

export class UnknownReactorRpcMessage extends BaseReactorRpcMessage {
    constructor(
        public readonly messageTag: number,
        public readonly bytes: Buffer
    ) {
        super();
    }

    Serialize(writer: HazelWriter) {
        writer.bytes(this.bytes);
    }
}

export class ReactorRpcMessage extends BaseRpcMessage {
    static messageTag = 255 as const;
    messageTag = 255 as const;

    constructor(
        public readonly modNetId: number,
        public readonly customRpc: BaseReactorRpcMessage
    ) {
        super();
    }

    get canceled() {
        return this.customRpc.canceled;
    }

    cancel() {
        this.customRpc.cancel();
    }

    static Deserialize(
        reader: HazelReader,
        direction: MessageDirection,
        decoder: PacketDecoder
    ) {
        const modNetId = reader.upacked();
        const callId = reader.upacked();

        const rpcMessageClass = decoder.types.get(`reactorRpc:${callId}`);

        const [ , mreader ] = reader.message();

        if (!rpcMessageClass)
            return new ReactorRpcMessage(modNetId, new UnknownReactorRpcMessage(callId, mreader.buffer));

        const rpc = rpcMessageClass.Deserialize(mreader, direction, decoder);

        return new ReactorRpcMessage(modNetId, rpc as BaseReactorRpcMessage);
    }

    Serialize(
        writer: HazelWriter,
        direction: MessageDirection,
        decoder: PacketDecoder
    ) {
        writer.upacked(this.modNetId);
        writer.upacked(this.customRpc.messageTag);
        writer.begin(0);
        writer.write(this.customRpc, direction, decoder);
        writer.end();
    }
}
