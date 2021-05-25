import { CancelableEvent } from "@skeldjs/events";
import { AllGameOptions, GameOptions } from "@skeldjs/protocol";
import { Code2Int } from "@skeldjs/util";
import { Client } from "../../Client";

export class WorkerBeforeCreateEvent extends CancelableEvent {
    static eventName = "worker.beforecreate" as const;
    eventName = "worker.beforecreate" as const;

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

    setGameOptions(options: Partial<AllGameOptions>) {
        this.gameOptions.patch(options);
    }

    setGameCode(code: number|string) {
        this.gameCode = typeof code === "string"
            ? Code2Int(code)
            : code;
    }
}