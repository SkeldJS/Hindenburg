import { CancelableEvent } from "@skeldjs/events";
import { Connection } from "../../../Connection";
import { Lobby } from "../../../lobby";

export class WorkerBeforeJoinEvent extends CancelableEvent {
    static eventName = "worker.beforejoin" as const;
    eventName = "worker.beforejoin" as const;

    private _alteredLobby: Lobby|undefined;

    constructor(
        public readonly connection: Connection,
        public readonly gameCode: number,
        public readonly foundLobby: Lobby|undefined
    ) {
        super();

        this._alteredLobby = foundLobby;
    }

    get alteredLobby() {
        return this._alteredLobby;
    }

    setLobby(lobby: Lobby|undefined) {
        this._alteredLobby = lobby;
    }
}