import { StatefulRoom, NetworkedObject, SpawnType } from "@skeldjs/core";
import { BaseRpcMessage } from "@skeldjs/protocol";
import { HazelWriter } from "@skeldjs/util";

export class UnknownComponent<RoomType extends StatefulRoom> extends NetworkedObject<RoomType> {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/no-empty-function
    deserializeFromReader() { }

    serializeToWriter(writer: HazelWriter, spawn: boolean): boolean {
        return false;
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/no-empty-function
    Serialize(): boolean {
        throw new Error("Cannot serialize unknown component; (you might need to disable Server-as-a-Host)");
    }
    
    async handleRemoteCall(rpc: BaseRpcMessage): Promise<void> {
        void rpc;
    }

    async processFixedUpdate(delta: number): Promise<void> {
        void delta;
    }

    async processAwake(): Promise<void> {
        void 0;
    }
}
