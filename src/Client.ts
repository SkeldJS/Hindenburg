import { DisconnectReason } from "@skeldjs/constant";
import { VersionInfo } from "@skeldjs/util";

import {
    AcknowledgePacket,
    DisconnectPacket,
    JoinGameMessage,
    Serializable
} from "@skeldjs/protocol";

import dgram from "dgram";

import { HindenburgServer } from "./HindenburgServer";
import { Room } from "./Room";

export interface SentPacket {
    nonce: number;
    acked: boolean;
}

export class Client {
    identified: boolean;
    username!: string;
    version!: VersionInfo;

    disconnected: boolean;

    private _incr_nonce: number;

    received: number[];
    sent: SentPacket[];

    room: Room|null;

    constructor(
        private server: HindenburgServer,
        public readonly remote: dgram.RemoteInfo,
        public readonly clientid: number
    ) {
        this.identified = false;

        this.disconnected = false;

        this._incr_nonce = 0;
        this.received = [];
        this.sent = [];

        this.room = null;
    }

    get address() {
        return this.remote.address + ":" + this.remote.port;
    }

    async ack(nonce: number) {
        /*const unacked = this.sent
            .filter(sent => sent.acked)
            .map((_, i) => i);

        if (unacked.length) {
            this.server.logger.log(
                "warn",
                "Client with ID %s is behind %s packets.",
                this.clientid, unacked.length
            );
        }*/

        await this.send(
            new AcknowledgePacket(
                nonce,
                []//unacked
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

    async disconnect(
        reason?: DisconnectReason,
        message?: string
    ) {
        if (this.disconnected)
            return;

        this.room?.handleLeave(this);
        this.disconnected = true;

        await this.send(
            new DisconnectPacket(
                reason,
                message,
                true
            )
        );

        if (reason) {
            this.server.logger.log(
                "info",
                "Client with ID %s disconnected. Reason: %s",
                this.clientid, DisconnectReason[reason]
            );
        } else {
            this.server.logger.log(
                "info",
                "Client with ID %s disconnected.",
                this.clientid
            );
        }
    }

    async joinError(
        reason: DisconnectReason,
        message?: string
    ) {
        if (this.disconnected)
            return;

        await this.send(
            new JoinGameMessage(
                reason,
                message
            )
        );
    }
}