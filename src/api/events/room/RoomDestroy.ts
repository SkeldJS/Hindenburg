import { BasicEvent } from "@skeldjs/events";
import { Room } from "../../../room";

export class RoomDestroyEvent extends BasicEvent {
    static eventName = "room.destroy" as const;
    eventName = "room.destroy" as const;

    constructor(
        public readonly room: Room
    ) {
        super();
    }
}