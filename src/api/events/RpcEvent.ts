import { BaseRpcMessage } from "@skeldjs/protocol";

export interface RpcEvent {
    /**
     * The rpc message for this event.
     */
    rpc: BaseRpcMessage;
}
