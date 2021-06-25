import { RpcMessageTag } from "@skeldjs/constant";
import { BaseRpcMessage } from "@skeldjs/protocol";
import { HazelReader, HazelWriter } from "@skeldjs/util";

import { Component } from "../Component";
import { Room } from "../Room";
import { PlayerVoteState } from "../util/PlayerVoteState";

export class MeetingHud extends Component {
    classname = "MeetingHud" as const;

    constructor(
        public readonly room: Room,
        public readonly owner: Room,
        public readonly netid: number
    ) {
        super(room, owner, netid);
    }
    
    Deserialize(reader: HazelReader, isSpawn: boolean) {
        if (isSpawn) {
            for (const [ playerId ] of this.room.playerInfo) {
                const player = this.room.players.playerIds.get(playerId);

                if (player) {
                    const state = new PlayerVoteState(this.room, undefined, false, false);
                    this.room.voteStates.set(playerId, state);
                }
            }
        }
        const numStates = reader.packed();
        for (let i = 0; i < numStates; i++) {
            const [ playerId, mreader ] = reader.message();
            const voteState = this.room.voteStates.get(playerId);
            if (voteState) {
                voteState.Deserialize(mreader);
            }
        }
    }

    Serialize(writer: HazelWriter, isSpawn: boolean) {
        let flag = false;
        for (const [ playerId, player ] of this.room.playerInfo) {

        }
        return flag;
    }

    async HandleRpc(message: BaseRpcMessage) {
        switch (message.tag) {
            case RpcMessageTag.CastVote:
                console.log("cast vote");
                break;
        }
    }
}