import { CancelableEvent } from "@skeldjs/events";
import { Client } from "../../Client";
import { Room } from "../../Room";

export class WorkerBeforeJoinEvent extends CancelableEvent {
    static eventName = "worker.beforejoin" as const;
    eventName = "worker.beforejoin" as const;

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

    setFoundRoom(room?: Room) {
        this.foundRoom = room;
    }
}