import { PlayerData } from "@skeldjs/core";
import { ClientConnection } from "./Connection";
import { Room } from "./Room";

export class Player {
    private readonly _internal: PlayerData;

    constructor(
        /**
         * The client connection that this player belongs to.
         */
        public readonly connection: ClientConnection,
        /**
         * The room that this player belongs to.
         */
        public readonly room: Room,
        /**
         * Internal SkeldJS [PlayerData](https://skeldjs.github.io/SkeldJS/classes/core.playerdata.html) structure
         * for this player.
         */
        internal: PlayerData
    ) {
        this._internal = internal;
    }

    /**
     * The server-unique client ID of this player.
     */
    get clientid() {
        return this.connection?.clientid;
    }

    /**
     * Get the internal SkeldJS [PlayerData](https://skeldjs.github.io/SkeldJS/classes/core.playerdata.html) structure.
     * @example
     * ```ts
     * const room = new Room(worker);
     * console.log(room.getInternal()); // PlayerData
     * ```
     */
    getInternal() {
        return this._internal;
    }
}