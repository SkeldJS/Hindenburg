import { HazelReader, HazelWriter } from "@skeldjs/util";
import { Player } from "./Player";
import { Room } from "./Room";

export abstract class Component {
    constructor(
        public readonly room: Room,
        public readonly owner: Room|Player,
        public readonly netid: number
    ) {}

    abstract Deserialize(reader: HazelReader, isSpawn: boolean): void;

    abstract Serialize(writer: HazelWriter, isSpawn: boolean): boolean;
}