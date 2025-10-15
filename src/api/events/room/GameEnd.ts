import { EndGameIntent, GameOverReason } from "@skeldjs/core";
import { BasicEvent, CancelableEvent } from "@skeldjs/events";
import { Room } from "../../../Room";

export class RoomGameEndEvent extends BasicEvent implements CancelableEvent {
    canceled: boolean;

    constructor(
        public readonly room: Room,
        public readonly reason: GameOverReason,
        public readonly intent?: EndGameIntent
    ) {
        super();

        this.canceled = false;
    }

    cancel(): void {
        this.canceled = true;
    }
}
