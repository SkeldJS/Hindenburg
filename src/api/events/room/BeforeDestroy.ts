import { DisconnectReason } from "@skeldjs/constant";
import { CancelableEvent } from "@skeldjs/events";
import { Room } from "../../../Room";

/**
 * Emitted just before a room is destroyed.
 * 
 * See {@link RoomDestroyEvent} to guarantee that the room has been destroyed
 * and cannot be brought back.
 */
export class RoomBeforeDestroyEvent extends CancelableEvent {
    static eventName = "room.beforedestroy" as const;
    eventName = "room.beforedestroy" as const;

    constructor(
        /**
         * The room that is being destroyed.
         */
        public readonly room: Room,
        /**
         * Reason for why the room will be destroyed.
         */
        public readonly reason: DisconnectReason
    ) {
        super();
    }
}