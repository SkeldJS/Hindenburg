import { BasicEvent } from "@skeldjs/events";
import { Room } from "../../../Room";

/**
 * Emitted after a room has successfully been created.
 * 
 * See {@link RoomBeforeCreateEvent} for a hookable create event.
 */
export class RoomCreateEvent extends BasicEvent {
    static eventName = "room.create" as const;
    eventName = "room.create" as const;

    constructor(
        /**
         * The room that was created.
         */
        public readonly room: Room
    ) {
        super();
    }
}