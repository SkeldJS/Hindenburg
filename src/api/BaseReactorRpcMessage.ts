import { BaseMessage } from "@skeldjs/protocol";

export class BaseReactorRpcMessage extends BaseMessage {
    static messageType = "reactorRpc" as const;
    messageType = "reactorRpc" as const;

    static modId = "";
    modId = "";
}
