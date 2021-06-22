import { BaseMessage } from "@skeldjs/protocol";

export class BaseReactorRpcMessage extends BaseMessage {
    static type = "reactorRpc" as const;
    type = "reactorRpc" as const;

    static modId = "";
    modId = "";
}