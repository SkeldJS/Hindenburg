import { Player } from "../Player";
import { Room } from "../Room";

export class PlayerStore extends Map<number, Player> {
    playerIds: Map<number, Player>;

    constructor(
        public readonly room: Room
    ) {
        super();

        this.playerIds = new Map;
    }

    get host() {
        if (!this.room.hostid) return undefined;
        return this.get(this.room.hostid);
    }
}