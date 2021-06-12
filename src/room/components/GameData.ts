import { HazelReader, HazelWriter } from "@skeldjs/util";
import { Component } from "../Component";
import { Room } from "../Room";
import { PlayerInfo } from "../util/PlayerInfo";

export class GameData implements Component {
    constructor(
        public readonly room: Room,
        public readonly owner: Room,
        public readonly netid: number
    ) {}
    
    Deserialize(reader: HazelReader, isSpawn: boolean) {
        if (isSpawn) {
            const num_players = reader.upacked();

            for (let i = 0; i < num_players; i++) {
                const playerId = reader.uint8();
                const playerInfo = reader.read(PlayerInfo, playerId);
                this.room.playerInfo.set(playerId, playerInfo);
            }
        } else {
            while (reader.left) {
                const [ playerId, preader ] = reader.message();

                const player = this.room.playerInfo.get(playerId);

                if (player) {
                    player.Deserialize(preader);
                } else {
                    const playerInfo = preader.read(PlayerInfo, playerId);
                    this.room.playerInfo.set(playerId, playerInfo);
                }
            }
        }
    }

    Serialize(writer: HazelWriter, isSpawn: boolean) {
        let flag = false;
        if (isSpawn) {
            writer.upacked(this.room.playerInfo.size);
        }
        for (const [ playerId, player ] of this.room.playerInfo) {
            if (player.dirty || isSpawn) {
                if (isSpawn) {
                    writer.uint8(playerId);
                    writer.write(player);
                } else {
                    writer.begin(playerId);
                    writer.write(player);
                    writer.end();
                }
                player.dirty = false;
                flag = true;
            }
        }
        return flag;
    }
}