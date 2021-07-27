import { RootMessageTag } from "@skeldjs/constant";
import { Code2Int, HazelReader, HazelWriter } from "@skeldjs/util";

import {
    PacketDecoder,
    MessageDirection,
    BaseGameDataMessage,
    BaseRootMessage
} from "@skeldjs/protocol";

export class UnknownGameData extends BaseGameDataMessage {
    static tag = 255 as const;
    
    constructor(
        public readonly tag: number,
        public readonly bytes: Buffer
    ) {
        super();
    }

    Serialize(writer: HazelWriter) {
        writer.bytes(this.bytes);
    }
}

export class GameDataMessage extends BaseRootMessage {
    static tag = RootMessageTag.GameData as const;
    tag = RootMessageTag.GameData as const;

    code: number;
    children: BaseGameDataMessage[];

    constructor(code: string | number, children: BaseGameDataMessage[]) {
        super();

        if (typeof code === "string") {
            this.code = Code2Int(code);
        } else {
            this.code = code;
        }

        this.children = children;
    }

    static Deserialize(
        reader: HazelReader,
        direction: MessageDirection,
        decoder: PacketDecoder
    ) {
        const code = reader.int32();

        const children: BaseGameDataMessage[] = [];

        while (reader.left) {
            const [tag, mreader] = reader.message();

            const rootMessageClass = decoder.types.get(`gamedata:${tag}`);

            if (!rootMessageClass) {
                children.push(new UnknownGameData(tag, mreader.buffer));
                continue;
            }

            const root = rootMessageClass.Deserialize(
                mreader,
                direction,
                decoder
            );
            children.push(root as BaseGameDataMessage);
        }

        return new GameDataMessage(code, children);
    }

    Serialize(
        writer: HazelWriter,
        direction: MessageDirection,
        decoder: PacketDecoder
    ) {
        writer.int32(this.code);

        for (let i = 0; i < this.children.length; i++) {
            const message = this.children[i];
            if (!decoder.types.has(`gamedata:${message.tag}`))
                continue;

            writer.begin(message.tag);
            writer.write(message, direction, decoder);
            writer.end();
        }
    }
}
