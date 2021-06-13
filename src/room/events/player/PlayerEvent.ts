import { Player } from "../../Player";

export interface PlayerEvent {
    /**
     * The player that emitted this event.
     */
    player: Player;
}