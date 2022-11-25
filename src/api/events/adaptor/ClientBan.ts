import { BasicEvent } from "@skeldjs/events";

import { Connection } from "../../../worker";
import { ClientEvent } from "../client";

/**
 * Emitted when a client should be banned.
 */
export class ClientBanEvent extends BasicEvent implements ClientEvent {
    static eventName = "client.ban" as const;
    eventName = "client.ban" as const;

    constructor(
        /**
         * The client that was banned.
         */
        public readonly client: Connection,
        /**
         * The reason for why the client was banned. The Anti-Cheat will simply
         * provide the rule that the client broke to get banned, while a client
         * that is manually banned might have a more verbose description.
         */
        public readonly reason: string,
        /**
         * The duration, in seconds, of how long the client was banned for.
         */
        public readonly duration: number
    ) {
        super();
    }
}
