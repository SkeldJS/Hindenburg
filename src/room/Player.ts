import chalk from "chalk";

import { DisconnectReason } from "@skeldjs/constant";
import { Vector2 } from "@skeldjs/util";

import { Connection } from "../Connection";
import { Room } from "./Room";
import { PlayerControl } from "./components/PlayerControl";
import { PlayerPhysics } from "./components/PlayerPhysics";
import { CustomNetworkTransform } from "./components/CustomNetworkTransform";

export enum PlayerComponents {
    PlayerControl,
    PlayerPhysics,
    CustomNetworkTransform
}

export class Player {
    /**
     * Whether this player has spawned yet.
     */
    spawned: boolean;

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
     * This player's [PlayerControl](https://github.com/codyphobe/among-us-protocol/blob/master/05_innernetobject_types/04_playercontrol.md) component.
     */
    control?: PlayerControl;

    /**
     * This player's [PlayerPhysics](https://github.com/codyphobe/among-us-protocol/blob/master/05_innernetobject_types/09_playerphysics.md) component.
     */
    physics?: PlayerPhysics;

    /**
     * This player's [CustomNetworkTransform](https://github.com/codyphobe/among-us-protocol/blob/master/05_innernetobject_types/10_customnetworktransform.md) component.
     */
    transform?: CustomNetworkTransform;

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
        this.spawned = false;

        this.playerId = 0;
        this.position = Vector2.null;
        this.velocity = Vector2.null;
    }
    
    [Symbol.for("nodejs.util.inspect.custom")]() {
        let paren = this.clientId + ", " + this.connection.roundTripPing + "ms";

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
}