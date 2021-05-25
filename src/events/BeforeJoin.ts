import { CancelableEvent } from "@skeldjs/events";
import { Client } from "../Client";
import { Room } from "../Room";

export class BeforeJoinEvent extends CancelableEvent {
    static eventName = "room.beforejoin" as const;
    eventName = "room.beforejoin" as const;

    client: Client;
    gameCode: number;
    foundRoom?: Room;

    constructor(
        client: Client,
        gameCode: number,
        foundRoom?: Room
    ) {
        super();

        this.client = client;
        this.gameCode = gameCode;
        this.foundRoom = foundRoom;
    }

    setRoom(room: Room) {
        this.foundRoom = room;
    }
}