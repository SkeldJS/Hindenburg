import { DisconnectReason } from "@skeldjs/constant";
import { BasicEvent } from "@skeldjs/events";
import { Client } from "../Client";

export class ClientDisconnectEvent extends BasicEvent {
    static eventName = "client.disconnect" as const;
    eventName = "client.disconnect" as const;

    client: Client;
    reason: DisconnectReason;

    constructor(
        client: Client,
        reason: DisconnectReason
    ) {
        super();

        this.client = client;
        this.reason = reason;
    }
}