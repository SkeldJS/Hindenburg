import { Player } from "../Player";
import { Room } from "../Room";

export class PlayerStore extends Map<number, Player> {
    /**
     * A map of player IDs to players, used to get a player by their player ID.
     */
    playerIds: Map<number, Player>;

    constructor(
        public readonly room: Room
    ) {
        super();

        this.playerIds = new Map;
    }

    /**
     * The host player of the room.
     */
    get host() {
        if (!this.room.hostid) return undefined;
        return this.get(this.room.hostid);
    }

    /**
     * Loops through all players to find a player with a specified name.
     * @param name The name to search for.
     * @returns A player with that name or `undefined` if there isn't one.
     * @example
     * ```ts
     * // Get a player by the name of "ForteBass"
     * const forte = room.players.getPlayerByName("ForteBass");
     * 
     * if (!forte)
     *   return console.log("Forte is not in the room unfortunately.");
     * 
     * console.log("Forte is in the room!!!!");
     * ```
     */
    getPlayerByName(name: string) {
        for (const [ , player ] of this) {
            if (player.info?.name === name)
                return player;
        }
        return undefined;
    }
}