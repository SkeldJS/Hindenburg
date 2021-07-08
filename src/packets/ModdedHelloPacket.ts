import { GameKeyword, QuickChatMode, SendOption } from "@skeldjs/constant";
import { BaseRootPacket, HelloPacket } from "@skeldjs/protocol";
import { HazelReader, HazelWriter, VersionInfo } from "@skeldjs/util";

export class ModdedHelloPacket extends BaseRootPacket {
    static tag = SendOption.Hello as const;
    tag = SendOption.Hello as const;

    constructor(
        public readonly nonce: number,
        public readonly clientver: VersionInfo,
        public readonly username: string,
        public readonly token: number,
        public readonly language: GameKeyword,
        public readonly chatMode: QuickChatMode,
        public readonly protocolver?: number,
        public readonly modcount?: number,
    ) {
        super();
    }

    isNormalHello(): this is HelloPacket {
        return this.protocolver === undefined;
    }

    static Deserialize(reader: HazelReader) {
        const nonce = reader.uint16(true);
        reader.jump(1); // Skip hazel version.
        const clientver = reader.read(VersionInfo);
        const username = reader.string();
        const token = reader.uint32();
        const language = reader.uint32();
        const chatMode = reader.uint8();

        if (reader.left) {
            const protocolversion = reader.uint8();
            const modcount = reader.packed();
    
            return new ModdedHelloPacket(
                nonce,
                clientver,
                username,
                token,
                language,
                chatMode,
                protocolversion,
                modcount
            );
        } else {
            return new ModdedHelloPacket(
                nonce,
                clientver,
                username,
                token,
                language,
                chatMode
            );
        }
    }

    Serialize(writer: HazelWriter) {
        writer.uint16(this.nonce, true);
        writer.write(this.clientver);
        writer.string(this.username);
        writer.uint32(this.token);
        writer.uint32(this.language);
        writer.uint8(this.chatMode);
        writer.uint8(this.protocolver || 0);
        writer.packed(this.modcount || 0);
    }
}