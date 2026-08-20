import { BasicEvent } from "@skeldjs/events";
import { Player } from "@skeldjs/au-core";

import { Room } from "../../../Room";

/**
 * Emitted when a Hide and Seek game starts.
 * Contains information about the seeker, hiders, and hide duration.
 */
export class RoomHideAndSeekStartEvent extends BasicEvent {
    static eventName = "room.hideandseekstart" as const;
    eventName = "room.hideandseekstart" as const;

    constructor(
        public readonly room: Room,
        /**
         * The player selected as the seeker (impostor role).
         */
        public readonly seekerPlayer: Player<Room>,
        /**
         * All players who are hiders (crewmate roles).
         */
        public readonly hiderPlayers: Player<Room>[],
        /**
         * The duration in seconds that hiders have to hide.
         */
        public readonly hideDuration: number,
    ) {
        super();
    }
}
