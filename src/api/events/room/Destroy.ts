import { BasicEvent } from "@skeldjs/events";
import { Room } from "../../../worker";

/**
 * Emitted after a room has been destroyed.
 *
 * See {@link RoomBeforeDestroyEvent} for a hookable destroy event.
 */
export class RoomDestroyEvent extends BasicEvent {
    static eventName = "room.destroy" as const;
    eventName = "room.destroy" as const;

    constructor(
        /**
         * The room that was destroyed.
         */
        public readonly room: Room
    ) {
        super();
    }
}
