import { CancelableEvent } from "@skeldjs/events";
import { Client } from "../../Client";

export class LoadBalancerBeforeJoinEvent extends CancelableEvent {
    static eventName = "loadbalancer.beforejoin" as const;
    eventName = "loadbalancer.beforejoin" as const;

    client: Client;
    gameCode: number;
    redirectIp?: string;
    redirectPort?: number;

    constructor(
        client: Client,
        gameCode: number,
        redirectIp?: string,
        redirectPort?: number,
    ) {
        super();

        this.client = client;
        this.gameCode = gameCode;
        this.redirectIp = redirectIp;
        this.redirectPort = redirectPort;
    }

    setRedirect(ip: string, port: number) {
        this.redirectIp = ip;
        this.redirectPort = port;
    }
}