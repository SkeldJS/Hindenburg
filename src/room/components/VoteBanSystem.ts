import { BaseRpcMessage } from "@skeldjs/protocol";
import { HazelReader, HazelWriter } from "@skeldjs/util";

import { Component } from "../Component";
import { Player } from "../Player";
import { Room } from "../Room";
import { DirtySet } from "../util/DirtyMap";

export class VoteBanSystem implements Component {
    constructor(
        public readonly room: Room,
        public readonly owner: Room,
        public readonly netid: number
    ) {}
    
    Deserialize(reader: HazelReader, isSpawn: boolean) {
        const numPlayers = reader.uint8();
        for (let i = 0; i < numPlayers; i++) {
            const votedId = reader.uint32();
            const voters: DirtySet<Player> = new DirtySet;
            const voted = this.room.players.get(votedId);

            if (voted) {
                voted.voteKicks = voters;
            }
            for (let i = 0; i < 3; i++) {
                const voterId = reader.upacked();
                if (voted) {
                    const voter = this.room.players.get(voterId);
                    if (voter) {
                        voters.add(voter);
                    }
                }
            }
        }
    }

    Serialize(writer: HazelWriter, isSpawn: boolean) {
        let flag = false;
        for (const [ clientId, player ] of this.room.players) {
            if (player.voteKicks.dirty) {
                flag = true;
                
                writer.uint32(clientId);

                for (const voter of player.voteKicks) {
                    writer.upacked(voter ? voter.clientId : 0);
                }
            }
        }
        return flag;
    }

    async HandleRpc(message: BaseRpcMessage) {
        
    }
}