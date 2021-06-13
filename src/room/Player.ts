import chalk from "chalk";

import { DisconnectReason, LimboStates } from "@skeldjs/constant";
import { Vector2 } from "@skeldjs/util";
import { EventEmitter, ExtractEventTypes } from "@skeldjs/events";

import { Connection } from "../Connection";
import { Room } from "./Room";
import { PlayerComponentStore } from "./util/PlayerComponentStore";
import { PlayerSetNameEvent } from "./events";

export type PlayerEvents = ExtractEventTypes<[
    PlayerSetNameEvent
]>;

export class Player extends EventEmitter<PlayerEvents> {
    limboState: LimboStates;

    /**
     * The game-unique identifier for this player.
     */
    playerId: number;

    /**
     * The unlerped position of this player.
     */
    position: Vector2;

    /**
     * The velocity of this player.
     */
    velocity: Vector2;

    /**
     * The components spawned for this player.
     */
    components: PlayerComponentStore;

    constructor(
        /**
         * The client connection that this player belongs to.
         */
        public readonly connection: Connection,
        /**
         * The room that this player belongs to.
         */
        public readonly room: Room
    ) {
        super();

        this.limboState = LimboStates.PreSpawn;

        this.playerId = 0;
        this.position = Vector2.null;
        this.velocity = Vector2.null;

        this.components = new PlayerComponentStore;
    }
    
    [Symbol.for("nodejs.util.inspect.custom")]() {
        let paren = this.clientId + ", " + this.connection.roundTripPing + "ms" + (this.isHost ? ", host" : "");

        return chalk.blue(this.info?.name || "<No Name>")
            + " " + chalk.grey("(" + paren + ")");
    }

    /**
     * The server-unique client ID of this player.
     */
    get clientId() {
        return this.connection?.clientId;
    }

    /**
     * Whether this player is the host of their room.
     */
    get isHost() {
        return this.clientId === this.room.hostid;
    }
    
    /**
     * General information about this player.
     */
    get info() {
        return this.room.playerInfo.get(this.playerId);
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

    /**
     * Vote to kick someone as this player.
     * @param target The player to vote kick.
     * @example
     * ```ts
     * // Make everyone vote kick ForteBass.
     * const forte = room.players.getPlayerByName("ForteBass");
     * 
     * if (!forte)
     *   return;
     * 
     * for (const [ clientId, player ] of room.players) {
     *   if (player === forte)
     *     continue;
     * 
     *   player.voteKick(forte);
     * }
     * ```
     */
    voteKick(target: Player) {
        this.room.voteKicks.addVote(this, target);
    }
}