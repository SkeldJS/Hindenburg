import { EndGameIntent, GameOverReason, RoomGameEndEvent as SkeldjsRoomGameEndEvent } from "@skeldjs/core";
import { CancelableEvent } from "@skeldjs/events";
import { Room } from "../../../worker";

export class RoomGameEndEvent extends SkeldjsRoomGameEndEvent implements CancelableEvent {
    canceled: boolean;

    constructor(
        public readonly room: Room,
        public readonly reason: GameOverReason,
        public readonly intent?: EndGameIntent
    ) {
        super(room, reason);

        this.canceled = false;
    }

    cancel(): void {
        this.canceled = true;
    }
}
