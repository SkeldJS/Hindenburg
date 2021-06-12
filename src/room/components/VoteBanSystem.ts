import { HazelReader, HazelWriter } from "@skeldjs/util";
import { Component } from "../Component";
import { Player } from "../Player";
import { Room } from "../Room";

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
            const voters: Set<Player> = new Set;
            const voted = this.room.players.get(votedId);

            if (voted) {
                this.room.voteKicks.votes.set(voted, voters);
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
        if (this.room.voteKicks.dirty) {
            writer.upacked(this.room.voteKicks.votes.size);

            for (const [voted, voters] of this.room.voteKicks.votes) {
                writer.uint32(voted.clientId);

                for (const voter of voters) {
                    writer.upacked(voter ? voter.clientId : 0);
                }
            }
            return true;
        }
        return false;
    }
}