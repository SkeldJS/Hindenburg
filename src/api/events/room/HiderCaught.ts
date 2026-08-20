import { BasicEvent } from "@skeldjs/events";
import { Player } from "@skeldjs/au-core";

import { Room } from "../../../Room";

/**
 * Emitted when a hider is caught (killed) by the seeker in Hide and Seek mode.
 */
export class RoomHiderCaughtEvent extends BasicEvent {
    static eventName = "room.hidercaught" as const;
    eventName = "room.hidercaught" as const;

    constructor(
        public readonly room: Room,
        /**
         * The hider player that was caught.
         */
        public readonly hiderPlayer: Player<Room>,
        /**
         * The seeker player that caught the hider.
         */
        public readonly seekerPlayer: Player<Room>,
        /**
         * How many hiders remain alive.
         */
        public readonly remainingHiders: number,
    ) {
        super();
    }
}
