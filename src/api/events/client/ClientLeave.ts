import { BasicEvent } from "@skeldjs/events";

import { Connection, Room } from "../../../worker";

/**
 * Emitted when a client leaves the room that they're in, i.e. by disconnecting.
 */
export class ClientLeaveEvent extends BasicEvent {
    static eventName = "client.leave" as const;
    eventName = "client.leave" as const;

    constructor(
        /**
         * The client that left the room.
         */
        public readonly client: Connection,
        /**
         * The room that the client left.
         */
        public readonly room: Room
    ) {
        super();
    }
}
