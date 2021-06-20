import { BaseRpcMessage } from "@skeldjs/protocol";
import { HazelReader, HazelWriter } from "@skeldjs/util";

import { Component } from "../Component";
import { Player } from "../Player";
import { Room } from "../Room";

export class PlayerPhysics implements Component {
    constructor(
        public readonly room: Room,
        public readonly owner: Player,
        public readonly netid: number
    ) {}
    
    Deserialize(reader: HazelReader, isSpawn: boolean) {

    }

    Serialize(writer: HazelWriter, isSpawn: boolean) {
        return false;
    }

    async HandleRpc(message: BaseRpcMessage) {
        
    }
}