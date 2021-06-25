import { BaseRpcMessage, DespawnMessage } from "@skeldjs/protocol";
import { HazelReader, HazelWriter } from "@skeldjs/util";

import { Player } from "./Player";
import { Room } from "./Room";

export abstract class Component {
    classname!: string;

    constructor(
        public readonly room: Room,
        public readonly owner: Room|Player,
        public readonly netid: number
    ) {}

    abstract Deserialize(reader: HazelReader, isSpawn: boolean): void;
    abstract Serialize(writer: HazelWriter, isSpawn: boolean): boolean;
    abstract HandleRpc(message: BaseRpcMessage): Promise<void>;

    async despawn() {
        await this.room.components.removeComponent(this);
        await this.room.gamedataStream.push(
            new DespawnMessage(this.netid)
        );
    }
}