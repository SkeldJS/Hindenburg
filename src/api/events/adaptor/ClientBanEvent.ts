import { BasicEvent } from "@skeldjs/events";

import { Connection } from "../../../Connection";
import { ClientEvent } from "../client";

export class ClientBanEvent extends BasicEvent implements ClientEvent {
    static eventName = "client.ban" as const;
    eventName = "client.ban" as const;

    constructor(
        public readonly client: Connection,
        public readonly duration: number
    ) {
        super();
    }
}