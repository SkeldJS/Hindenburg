import { BasicEvent } from "@skeldjs/events";
import { Connection } from "../../../Connection";
import { ClientEvent } from "./ClientEvent";

export class ClientConnectEvent extends BasicEvent implements ClientEvent {
    static eventName = "client.connect" as const;
    eventName = "client.connect" as const;

    constructor(
        public readonly client: Connection
    ) {
        super();
    }
}