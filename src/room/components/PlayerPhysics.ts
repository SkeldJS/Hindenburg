import { BaseRpcMessage } from "@skeldjs/protocol";
import { HazelReader, HazelWriter } from "@skeldjs/util";

import { Component } from "../Component";
import { Player } from "../Player";
import { Room } from "../Room";

export class PlayerPhysics extends Component {
    classname = "PlayerPhysics" as const;

    constructor(
        public readonly room: Room,
        public readonly owner: Player,
        public readonly netid: number
    ) {
        super(room, owner, netid);
    }
    
    Deserialize(reader: HazelReader, isSpawn: boolean) {

    }

    Serialize(writer: HazelWriter, isSpawn: boolean) {
        return false;
    }

    async HandleRpc(message: BaseRpcMessage) {
        
    }
}