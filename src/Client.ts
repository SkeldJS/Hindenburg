import { AcknowledgePacket, Serializable } from "@skeldjs/protocol";
import dgram from "dgram";

import { HindenburgServer } from "./HindenburgServer";

export interface SentPacket {
    nonce: number;
    acked: boolean;
}

export class Client {
    identified: boolean;
    username: string;
    version: number;

    private _incr_nonce: number;

    received: number[];
    sent: SentPacket[];

    constructor(
        private server: HindenburgServer,
        public readonly remote: dgram.RemoteInfo,
        public readonly clientid: number
    ) {
        this.identified = false;
        this.username = "";
        this.version = 0;

        this._incr_nonce = 0;
        this.received = [];
        this.sent = [];
    }

    get address() {
        return this.remote.address + ":" + this.remote.port;
    }

    async ack(nonce: number) {
        await this.send(
            new AcknowledgePacket(
                nonce,
                this.sent.map(sent => sent.acked)
            )
        );
    }

    getNextNonce() {
        this._incr_nonce++;

        return this._incr_nonce;
    }

    async send(packet: Serializable) {
        return await this.server.send(this, packet);
    }
}