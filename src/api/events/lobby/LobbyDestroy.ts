import { BasicEvent } from "@skeldjs/events";
import { Lobby } from "../../../lobby";

export class LobbyDestroyEvent extends BasicEvent {
    static eventName = "lobby.destroy" as const;
    eventName = "lobby.destroy" as const;

    constructor(
        public readonly lobby: Lobby
    ) {
        super();
    }
}