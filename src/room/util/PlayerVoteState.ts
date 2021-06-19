import { HazelReader, HazelWriter } from "@skeldjs/util";
import { Player } from "../Player";
import { Room } from "../Room";

enum SpecialPlayerId {
    DeadVote = 252,
    SkippedVote,
    MissedVote,
    HasNotVoted
}

export class PlayerVoteState {
    constructor(
        public readonly room: Room,
        public votedFor: Player|"skip"|undefined,
        public isDead: boolean,
        public didReport: boolean
    ) {}

    static Deserialize(reader: HazelReader, room: Room) {
        const state = new PlayerVoteState(room, undefined, false, false);
        state.Deserialize(reader);
    }

    Deserialize(reader: HazelReader) {
        const votedForId = reader.uint8();
        this.didReport = reader.bool();
        
        this.isDead = false;
        if (votedForId === SpecialPlayerId.DeadVote) {
            this.isDead = true;
        } else if (votedForId === SpecialPlayerId.SkippedVote) {
            this.votedFor = "skip";
        } else if (
            votedForId === SpecialPlayerId.MissedVote ||
            votedForId === SpecialPlayerId.HasNotVoted
        ) {
            this.votedFor = undefined;
        } else {
            const votedFor = this.room.players.playerIds.get(votedForId);
            this.votedFor = votedFor;
        }
    }

    Serialize(writer: HazelWriter) {
        if (this.isDead) {
            writer.uint8(SpecialPlayerId.DeadVote);
        } else if (this.votedFor === "skip") {
            writer.uint8(SpecialPlayerId.SkippedVote);
        } else if (this.votedFor === undefined) {
            writer.uint8(SpecialPlayerId.HasNotVoted);
        } else {
            writer.uint8(this.votedFor.playerId);
        }
        writer.bool(this.didReport);
    }
}