import { PlayerData } from "@skeldjs/core";
import { Room } from "./Room";

export enum PerspectiveFilters {
    None = 0,
    All = 1
}

export class Perspective extends Room {
    constructor(
        private readonly parentRoom: Room,
        public readonly playersPov: PlayerData[],
        public readonly filter: number
    ) {
        super(parentRoom.worker, parentRoom.config, parentRoom.settings);
    }

    createPerspective(player: PlayerData, filter?: number): Perspective;
    createPerspective(players: PlayerData[], filter?: number): Perspective;
    createPerspective(players: PlayerData|PlayerData[], filter?: number): Perspective {
        throw new TypeError("Cannot create a perspective from another perspective; create one from the base room instead.");
    }
}