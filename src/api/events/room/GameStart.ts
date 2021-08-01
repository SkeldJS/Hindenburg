import { RoomGameStartEvent as SkeldjsRoomGameStartEvent } from "@skeldjs/core";
import { CancelableEvent } from "@skeldjs/events";
import { Room } from "../../../Room";

export class RoomGameStartEvent extends SkeldjsRoomGameStartEvent implements CancelableEvent {
    canceled: boolean;

    constructor(
        public readonly room: Room
    ) {
        super(room);

        this.canceled = false;
    }

    cancel(): void {
        this.canceled = true;
    }
}