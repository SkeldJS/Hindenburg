import { BasicEvent } from "@skeldjs/events";
import { Connection } from "../../../worker";
import { ClientEvent } from "./ClientEvent";

/**
 * Emitted when a client connects to the server. Emitted after the client has
 * sent a valid 0x08 Identify packet.
 */
export class ClientConnectEvent extends BasicEvent implements ClientEvent {
    static eventName = "client.connect" as const;
    eventName = "client.connect" as const;

    constructor(
        /**
         * The client that connected to the server, fully identified.
         */
        public readonly client: Connection
    ) {
        super();
    }
}
