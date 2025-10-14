import { BasicEvent, CancelableEvent } from "@skeldjs/events";
import { Room } from "../../../worker";
import { Player } from "@skeldjs/core";

export class RoomGameStartEvent extends BasicEvent implements CancelableEvent {
    canceled: boolean;

    constructor(
        public readonly room: Room,
        public readonly startedByPlayer: Player<Room>|undefined,
    ) {
        super();
        this.canceled = false;
    }

    cancel(): void {
        this.canceled = true;
    }
}
