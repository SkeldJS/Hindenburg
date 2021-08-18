import { BaseReactorMessage, ReactorMessageTag, ReactorMod, ReactorModDeclarationMessage } from "@skeldjs/reactor";
import { HazelReader, HazelWriter } from "@skeldjs/util";

export class ReactorPluginDeclarationMessage extends BaseReactorMessage {
    static messageTag = ReactorMessageTag.PluginDeclaration as const;
    messageTag = ReactorMessageTag.PluginDeclaration as const;

    constructor(
        public readonly netId: number,
        public readonly mod: ReactorMod
    ) {
        super();
    }

    static Deserialize(reader: HazelReader) {
        const netid = reader.upacked();
        const mod = reader.read(ReactorMod);
        return new ReactorModDeclarationMessage(netid, mod);
    }

    Serialize(writer: HazelWriter) {
        writer.upacked(this.netId);
        writer.write(this.mod);
    }
}