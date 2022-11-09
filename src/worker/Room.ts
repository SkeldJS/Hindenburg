import { Networkable, PlayerData } from "@skeldjs/core";
import {
    BaseGameDataMessage,
    GameSettings,
    MessageDirection
} from "@skeldjs/protocol";

import chalk from "chalk";

import { RoomsConfig } from "../interfaces";

import { Worker } from "./Worker";
import { BaseRoom } from "./BaseRoom";
import { Perspective, PerspectiveFilter, PresetFilter } from "./Perspective";
import { Connection } from "./Connection";
import { Logger } from "../logger";
import { fmtCode } from "../util/fmtCode";

export class Room extends BaseRoom {
    /**
     * A map of player client IDs to active perspectives in the room. Used as a
     * short-hand, as well as being faster than searching each active perspective.
     */
    playerPerspectives: Map<number, Perspective>;

    /**
     * A list of perspectives that are currently active in the room, see {@link Room.createPerspective}
     */
    activePerspectives: Perspective[];

    constructor(
        public readonly worker: Worker,
        public readonly config: RoomsConfig,
        settings: GameSettings
    ) {
        super(worker, config, settings);

        this.logger = new Logger(() => chalk.yellow(fmtCode(this.code)), this.worker.vorpal);

        this.playerPerspectives = new Map;
        this.activePerspectives = [];

        this.ownershipGuards = new Map;
    }

    /**
     * Create a {@link Perspective} object for this room, with preset filters to
     * use.
     *
     * This function is relatively slow as it needs to clone the entire room.
     * It shouldn't really be used in loops or any events that get fired a lot.
     *
     * @param players The player, or players, to create this perspective for.
     * @param filters Preset filters to use for both incoming and outgoing
     * filters.
     * @returns The created perspective.
     */
    createPerspective(
        players: PlayerData|PlayerData[],
        filters?: PresetFilter[]
    ): Perspective;
    /**
     * Create a {@link Perspective} object for this room, with preset filters to
     * use.
     *
     * This function is relatively slow as it needs to clone the entire room.
     * It shouldn't really be used in loops or any events that get fired a lot.
     *
     * @param players The player, or players, to create this perspective for.
     * @param incomingFilters Preset filters to use for incoming packets making
     * their way into the perspective..
     * @param outgoingFilters Preset filters to use for outgoing packets from the
     * perspective to the room. By default, same as the incoming filters.
     * @returns The created perspective.
     */
    createPerspective(
        players: PlayerData|PlayerData[],
        incomingFilters: PresetFilter[],
        outgoingFilters: PresetFilter[]
    ): Perspective;
    createPerspective(
        players: PlayerData|PlayerData[],
        incomingFilters: PresetFilter[] = [],
        outgoingFilters: PresetFilter[] = incomingFilters
    ): Perspective {
        if (this.worker.config.optimizations.disablePerspectives) {
            throw new Error("Perspectives are disabled, set 'optimisations.disablePerspectives' to false to re-enable perspectives");
        }

        if (!Array.isArray(players)) {
            return this.createPerspective([ players ], incomingFilters, outgoingFilters);
        }

        for (let i = 0; i < players.length; i++) {
            if (players[i].room !== this) {
                throw new TypeError("Tried to create a perspective from a player not in this room.");
            }

            if (this.playerPerspectives.has(players[i].clientId)) {
                throw new TypeError("Player already has active perspective.");
            }
        }

        const incomingFilter = new PerspectiveFilter(this.worker);
        const outgoingFilter = new PerspectiveFilter(this.worker);

        const perspective = new Perspective(this, players, incomingFilter, outgoingFilter);

        Perspective.applyPerspectiveFilter(perspective, incomingFilter, incomingFilters);
        Perspective.applyPerspectiveFilter(perspective, outgoingFilter, outgoingFilters);

        this.activePerspectives.push(perspective);
        for (let i = 0; i < players.length; i++) {
            this.playerPerspectives.set(players[i].clientId, perspective);
        }

        this.logger.info("Created perspective: %s", perspective);

        return perspective;
    }

    /**
     * Broadcast gamedata messages to each active perspective, respecting their
     * incoming filter. As a necessecity, this also broadcasts these messages to
     * players in the perpsectives whereas they would not normally have received
     * them.
     * @param connection The connection that sent these messages.
     * @param messages The messages in question.
     * @param reliable Whether these messages should be sent reliably (i.e. movement packets would be unreliable.
     */
    async broadcastToPerspectives(connection: Connection, messages: BaseGameDataMessage[], reliable: boolean) {
        if (this.worker.config.optimizations.disablePerspectives) {
            return;
        }

        const player = connection.getPlayer();

        if (!player)
            return;

        for (let i = 0; i < connection.room!.activePerspectives.length; i++) {
            const activePerspective = connection.room?.activePerspectives[i];

            if (!activePerspective)
                continue;

            if (activePerspective === player.room)
                continue;

            // get this player's player object in the perspective in question
            const povPlayer = activePerspective.players.get(player.clientId);

            if (!povPlayer) // if the sender is already in this perspective, we can skip
                continue;

            const povNotCanceled = [];
            for (let i = 0; i < messages.length; i++) {
                const child = messages[i];

                (child as any)._canceled = false; // reset the message's canceled state

                // match the message against the perspective's incoming decoder to check whether it should get sent there
                await activePerspective.incomingFilter.emitDecoded(child, MessageDirection.Serverbound, povPlayer);

                if (child.canceled) {
                    (child as any)._canceled = false;
                    continue;
                }

                // send message to the perspective
                await activePerspective.decoder.emitDecoded(child, MessageDirection.Serverbound, connection);

                if (child.canceled) {
                    (child as any)._canceled = false;
                    continue;
                }

                povNotCanceled.push(child);
            }

            if (povNotCanceled.length) {
                // broadcast all messages that weren't canceled to connections in this perspective
                await activePerspective.broadcastMessages(povNotCanceled, [], undefined, [connection], reliable);
            }
        }
    }

    /**
     * Guard an object so that no other room (or perspective) can make changes to it.
     *
     * This is useful when perspectives create conflicts and state becomes unmanageable;
     * just assign its logic to one room.
     *
     * Note that this is only a nominal change; plugins can still make changes freely - the only
     * change is that packets won't be managed by rooms that the object does not belong to.
     * @param netObject The object to own
     */
    guardObjectAsOwner(netObject: Networkable) {
        if (this.ownershipGuards.has(netObject.netId))
            throw new Error("An object with the same network id is already owned; the room must disown it first");

        this.ownershipGuards.set(netObject.netId, this);
    }

    /**
     * Unknown an object so that all rooms can make changes to it.
     * @param netObject The object to disown
     */
    disownObject(netObject: Networkable) {
        const ownership = this.ownershipGuards.get(netObject.netId);
        if (!ownership || ownership !== this)
            throw new Error("Cannot disown object; an object with that network id isn't owned by this room");

        this.ownershipGuards.delete(netObject.netId);
    }

    /**
     * Get the owner of an object.
     * @param netObject The object to disown
     */
    getOwnerOf(netObject: Networkable) {
        return this.ownershipGuards.get(netObject.netId);
    }

    canManageObject(object: Networkable): boolean {
        const ownership = this.ownershipGuards.get(object.netId);
        return !ownership || ownership === this;
    }
}
