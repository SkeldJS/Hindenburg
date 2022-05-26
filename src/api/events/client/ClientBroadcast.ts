import { CancelableEvent } from "@skeldjs/events";
import { BaseGameDataMessage, BaseRootMessage } from "@skeldjs/protocol";
import { Connection, Room } from "../../../worker";
import { ClientEvent } from "./ClientEvent";

export class ClientBroadcastEvent extends CancelableEvent implements ClientEvent {
    static eventName = "client.broadcast" as const;
    eventName = "client.broadcast" as const;

    private _alteredGameData: BaseGameDataMessage[];

    constructor(
        public readonly room: Room,
        /**
         * The client that connected to the server, fully identified.
         */
        public readonly client: Connection,
        public readonly gameData: BaseGameDataMessage[],
        public readonly payload: BaseRootMessage[]
    ) {
        super();

        this._alteredGameData = gameData;
    }

    get alteredGameData() {
        return this._alteredGameData;
    }

    setGameData(gamedata: BaseGameDataMessage[]) {
        this._alteredGameData = gamedata;
    }
}
