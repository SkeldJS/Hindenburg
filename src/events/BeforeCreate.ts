import { CancelableEvent } from "@skeldjs/events";
import { AllGameOptions, GameOptions } from "@skeldjs/protocol";
import { Code2Int } from "@skeldjs/util";
import { Client } from "../Client";

export class BeforeCreateEvent extends CancelableEvent {
    static eventName = "room.beforecreate" as const;
    eventName = "room.beforecreate" as const;

    client: Client;
    gameOptions: GameOptions;
    gameCode: number;

    constructor(
        client: Client,
        gameOptions: GameOptions,
        gameCode: number
    ) {
        super();

        this.client = client;
        this.gameOptions = gameOptions;
        this.gameCode = gameCode;
    }

    setOptions(options: Partial<AllGameOptions>) {
        this.gameOptions.patch(options);
    }

    setGameCode(code: number|string) {
        this.gameCode = typeof code === "string"
            ? Code2Int(code)
            : code;
    }
}