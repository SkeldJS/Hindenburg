import { DisconnectReason } from "@skeldjs/constant";
import { BasicEvent } from "@skeldjs/events";

import { Connection } from "../../../worker";
import { ClientEvent } from "./ClientEvent";

/**
 * Emitted when a client disconnected or is force-disconnected from the server.
 *
 */
export class ClientDisconnectEvent extends BasicEvent implements ClientEvent {
    static eventName = "client.disconnect" as const;
    eventName = "client.disconnect" as const;

    constructor(
        /**
         * The client that was disconnected from the server.
         */
        public readonly client: Connection,
        /**
         * The reason for why the client disconnected.
         */
        public readonly reason: DisconnectReason,
        /**
         * Custom message for why the client was disconnected, if {@link ClientDisconnectEvent.reason}
         * is "Custom".
         */
        public readonly customMessage?: string
    ) {
        super();
    }
}
