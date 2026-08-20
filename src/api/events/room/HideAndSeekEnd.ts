import { BasicEvent } from "@skeldjs/events";

import { Room } from "../../../Room";

/**
 * Emitted when a Hide and Seek game ends.
 */
export class RoomHideAndSeekEndEvent extends BasicEvent {
    static eventName = "room.hideandseekend" as const;
    eventName = "room.hideandseekend" as const;

    constructor(
        public readonly room: Room,
        /**
         * Who won the game.
         * - "seekers": The seeker killed all hiders.
         * - "hiders": The hiders completed all tasks or survived the timer.
         * - "none": The game ended without a winner (e.g., destroyed).
         */
        public readonly winner: "seekers" | "hiders" | "none",
        /**
         * The reason the game ended, for display/logging.
         */
        public readonly reason: string,
    ) {
        super();
    }
}
