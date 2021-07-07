import { CancelableEvent } from "@skeldjs/events";
import { Connection } from "../../../Connection";
import { Room } from "../../../room";

export class WorkerBeforeJoinEvent extends CancelableEvent {
    static eventName = "worker.beforejoin" as const;
    eventName = "worker.beforejoin" as const;

    private _alteredRoom: Room|undefined;

    constructor(
        public readonly connection: Connection,
        public readonly gameCode: number,
        public readonly foundRoom: Room|undefined
    ) {
        super();

        this._alteredRoom = foundRoom;
    }

    get alteredRoom() {
        return this._alteredRoom;
    }

    setRoom(room: Room|undefined) {
        this._alteredRoom = room;
    }
}