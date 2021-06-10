import chalk from "chalk";

import { Color, ColorCodes, DisconnectReason, PlayerData } from "@skeldjs/core";
import { ClientConnection } from "./Connection";
import { Room } from "./Room";
import { Int2Code } from "@skeldjs/util";

const pChalk = new chalk.Instance({ level: 2 });

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
    
    [Symbol.for("nodejs.util.inspect.custom")]() {
        let paren = this.clientid + ", " + this.connection.roundTripPing + "ms";

        return chalk.blue((this._internal.info?.name) || "<No Name>")
            + " " + chalk.grey("(" + paren + ")");
    }

    /**
     * The server-unique client ID of this player.
     */
    get clientid() {
        return this.connection?.clientid;
    }

    /**
     * Whether this player is the host of their room.
     */
    get isHost() {
        return this === this.room.host;
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

    /**
     * Kick this player from the room.
     * @param ban Whether this player should be banned for their war-crimes.
     */
    async kick(ban: boolean) {
        const reason = ban
            ? DisconnectReason.Banned
            : DisconnectReason.Kicked;
        await this.room.handleLeave(this.connection, reason);
        await this.connection.disconnect(reason);
        if (ban) {
            this.banFromRoom();
        }
    }

    /**
     * Ban anyone from this player's IP from joining the room. Note that this
     * does not disconnect the player, see {@link Player.kick}.
     */
    banFromRoom() {
        this.room.bans.add(this.connection.rinfo.address);
    }
}