import { BaseRpcMessage } from "@skeldjs/protocol";
import { HazelReader, HazelWriter } from "@skeldjs/util";

import { Component } from "../Component";
import { Player } from "../Player";
import { Room } from "../Room";

export class CustomNetworkTransform implements Component {
    dirty: boolean;

    constructor(
        public readonly room: Room,
        public readonly owner: Player,
        public readonly netid: number
    ) {
        this.dirty = false;
    }
    
    Deserialize(reader: HazelReader, isSpawn: boolean) {
        this.owner.position = reader.vector();
        this.owner.velocity = reader.vector();
    }

    Serialize(writer: HazelWriter, isSpawn: boolean) {
        if (this.dirty) {
            writer.vector(this.owner.position);
            writer.vector(this.owner.velocity);
            return true;
        }
        return false;
    }

    async HandleRpc(message: BaseRpcMessage) {
        
    }
}