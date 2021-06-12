import { HazelReader, HazelWriter } from "@skeldjs/util";
import { Component } from "../Component";
import { Player } from "../Player";
import { Room } from "../Room";

export class PlayerControl implements Component {
    constructor(
        public readonly room: Room,
        public readonly owner: Player,
        public readonly netid: number
    ) {}
    
    Deserialize(reader: HazelReader, isSpawn: boolean) {
        if (isSpawn) {
            reader.bool(); // Skip isNew
        }
        const playerId = this.owner.playerId;
        this.owner.playerId = reader.uint8();
        if (playerId !== this.owner.playerId) {
            this.room.players.playerIds.delete(playerId);
            this.room.players.playerIds.set(this.owner.playerId, this.owner);
        }
    }

    Serialize(writer: HazelWriter, isSpawn: boolean) {
        if (isSpawn) {
            writer.bool(true);
        }
        writer.uint8(this.owner.playerId);
        return isSpawn;
    }
}