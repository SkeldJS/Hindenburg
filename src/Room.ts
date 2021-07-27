import { PlayerData } from "@skeldjs/core";
import { GameSettings } from "@skeldjs/protocol";
import { RoomsConfig } from "./interfaces";

import { Worker } from "./Worker";
import { BaseRoom } from "./BaseRoom";
import { Perspective } from "./Perspective";

export class Room extends BaseRoom {
    playerPerspectives: Map<number, Perspective>;
    activePerspectives: Perspective[];

    constructor(
        public readonly worker: Worker,
        public readonly config: RoomsConfig, // todo: handle plugins & enforce settings configs
        settings: GameSettings
    ) {
        super(worker, config, settings);

        this.playerPerspectives = new Map;
        this.activePerspectives = [];
    }

    createPerspective(players: PlayerData|PlayerData[]): Perspective {
        if (!Array.isArray(players)) {
            return this.createPerspective([ players ]);
        }

        for (let i = 0; i < players.length; i++) {
            if (players[i].room !== this) {
                throw new TypeError("Tried to create a perspective from a player not in this room.");
            }

            if (this.playerPerspectives.has(players[i].id)) {
                throw new TypeError("Player already has active perspective.");
            }
        }

        const perspective = new Perspective(this, players);

        this.activePerspectives.push(perspective);
        for (let i = 0; i < players.length; i++) {
            this.playerPerspectives.set(players[i].id, perspective);
        }

        return perspective;
    }
}