import { Networkable, PlayerData } from "@skeldjs/core";
import { GameSettings } from "@skeldjs/protocol";

import chalk from "chalk";

import { RoomsConfig } from "../interfaces";

import { Worker } from "./Worker";
import { BaseRoom } from "./BaseRoom";
import { Logger } from "../logger";
import { fmtCode } from "../util/fmtCode";
import { Connection } from "./Connection";

export class Room extends BaseRoom {
    constructor(
        public readonly worker: Worker,
        public readonly config: RoomsConfig,
        settings: GameSettings,
        public readonly createdBy: Connection | undefined
    ) {
        super(worker, config, settings, createdBy);

        this.logger = new Logger(() => chalk.yellow(fmtCode(this.code)), this.worker.vorpal);

        this.ownershipGuards = new Map;
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
