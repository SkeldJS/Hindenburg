import { BaseRpcMessage, MessageDirection, PacketDecoder } from "@skeldjs/protocol";
import { HazelReader, HazelWriter } from "@skeldjs/util";

import { BaseReactorRpcMessage } from "../api";

export class ReactorRpcMessage extends BaseRpcMessage {
    static tag = 255 as const;
    tag = 255 as const;

    constructor(
        public readonly modNetId: number,
        public readonly customRpc: BaseReactorRpcMessage
    ) {
        super();
    }

    static Deserialize(
        reader: HazelReader,
        direction: MessageDirection,
        decoder: PacketDecoder
    ) {
        const modNetId = reader.upacked();
        const callId = reader.upacked();

        const rpcMessages = decoder.types.get("reactorRpc");

        if (!rpcMessages)
            return new ReactorRpcMessage(modNetId, new BaseReactorRpcMessage);

        const [ , mreader ] = reader.message();
        const rpcMessageClass = rpcMessages.get(callId);

        if (!rpcMessageClass)
            return new ReactorRpcMessage(modNetId, new BaseReactorRpcMessage);

        const rpc = rpcMessageClass.Deserialize(mreader, direction, decoder);

        return new ReactorRpcMessage(modNetId, rpc as BaseReactorRpcMessage);
    }

    Serialize(
        writer: HazelWriter,
        direction: MessageDirection,
        decoder: PacketDecoder
    ) {
        writer.upacked(this.modNetId);
        writer.upacked(this.customRpc.tag);
        writer.write(this.customRpc, direction, decoder);
    }
}