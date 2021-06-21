import { Player } from "../../../room";

export interface PlayerEvent {
    /**
     * The player that emitted this event.
     */
    player: Player;
}