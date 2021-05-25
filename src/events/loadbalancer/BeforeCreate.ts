import { CancelableEvent } from "@skeldjs/events";
import { AllGameOptions, GameOptions } from "@skeldjs/protocol";
import { Code2Int } from "@skeldjs/util";
import { Client } from "../../Client";

export class LoadBalancerBeforeCreateEvent extends CancelableEvent {
    static eventName = "loadbalancer.beforecreate" as const;
    eventName = "loadbalancer.beforecreate" as const;

    client: Client;
    gameOptions: GameOptions;
    redirectIp: string;
    redirectPort: number;

    constructor(
        client: Client,
        gameOptions: GameOptions,
        redirectIp: string,
        redirectPort: number,
    ) {
        super();

        this.client = client;
        this.gameOptions = gameOptions;
        this.redirectIp = redirectIp;
        this.redirectPort = redirectPort;
    }

    setGameOptions(options: Partial<AllGameOptions>) {
        this.gameOptions.patch(options);
    }

    setRedirect(ip: string, port: number) {
        this.redirectIp = ip;
        this.redirectPort = port;
    }
}