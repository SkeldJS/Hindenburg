import { BasicEvent } from "@skeldjs/events";

import { Connection } from "../../../Connection";
import { ClientEvent } from "../client";

/**
 * Emitted when a client should be banned. This event is emitted specifically to
 * be handled by a [ban handler plugin](https://skeldjs.github.io/Hindenburg/pages/Setting%20Up/Ban%20Handling).
 * 
 * Often sent because of the Anti-Cheat.
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