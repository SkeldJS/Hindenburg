import dgram from "dgram";
import util from "util";

import { DisconnectReason } from "@skeldjs/constant";
import { VersionInfo } from "@skeldjs/util";

import {
    AcknowledgePacket,
    DisconnectPacket,
    JoinGameMessage,
    ReliablePacket,
    Serializable
} from "@skeldjs/protocol";
import { EventEmitter, ExtractEventTypes } from "@skeldjs/events";
import { DisconnectMessages } from "@skeldjs/data";

import { MatchmakingNode, ModInfo } from "./MatchmakingNode";
import { Room } from "./Room";
import { formatSeconds } from "./util/format-seconds";
import { ClientDisconnectEvent } from "./events";
import { AnticheatConfig, AnticheatValue } from "./Anticheat";

export interface SentPacket {
    nonce: number;
    acked: boolean;
}

export type ClientEvents = ExtractEventTypes<[
    ClientDisconnectEvent
]>;

export class Client extends EventEmitter<ClientEvents> {
    identified: boolean;
    username!: string;
    version!: VersionInfo;

    disconnected: boolean;

    private _incr_nonce: number;
    last_nonce: number;

    received: number[];
    sent: SentPacket[];

    room: Room|null;

    mods?: ModInfo[];

    constructor(
        private server: MatchmakingNode,
        public readonly remote: dgram.RemoteInfo,
        public readonly clientid: number
    ) {
        super();

        this.identified = false;
        this.disconnected = false;

        this._incr_nonce = 0;
        this.last_nonce = 0;
        this.received = [];
        this.sent = [];

        this.room = null;
    }

    get address() {
        return this.remote.address + ":" + this.remote.port;
    }
    
    async emit<Event extends ClientEvents[keyof ClientEvents]>(
        event: Event
    ): Promise<Event> {
        this.server.emit(event);

        return super.emit(event);
    }
    
    async ban(infraction: keyof AnticheatConfig, seconds: number) {
        this.disconnect(
            DisconnectReason.Custom,
            this.server.config.anticheat.banMessage
                .replace("%s", formatSeconds(seconds)
                .replace("%i", infraction))
        );
    
        await this.server.redis.set("bans." + this.remote.address, new Date(Date.now() + (seconds * 1000)).toString());
        this.server.redis.expire("bans." + this.remote.address, seconds);
    }

    async penalize(infraction: keyof AnticheatConfig) {
        const config = this.server.config.anticheat[infraction] as boolean|AnticheatValue;

        if (config) {
            if (typeof config === "boolean") {
                this.disconnect(DisconnectReason.Hacking);
                this.server.logger.warn(
                    "Client with ID %s was disconnected for anticheat rule %s.",
                    this.clientid, infraction
                );
            } else if (config.penalty !== "ignore") {
                if (config.strikes && config.strikes > 1) {
                    const strikes = await this.server.redis.incr("infractions." + this.server.ip + "." + this.clientid + "." + infraction);
                    this.server.logger.warn(
                        "Client with ID %s is on %s strike(s) for anticheat rule %s.",
                        this.clientid, strikes, infraction
                    );
    
                    if (strikes < config.strikes) {
                        return false;
                    }
                }

                if (config.penalty === "ban") {
                    await this.ban(infraction, config.banDuration || 3600);
                    this.server.logger.warn(
                        "Client with ID %s was banned for anticheat rule %s for %s.",
                        this.clientid, infraction, formatSeconds(config.banDuration || 3600)
                    );
                } else {
                    this.disconnect(DisconnectReason.Hacking);
                    this.server.logger.warn(
                        "Client with ID %s was disconnected for anticheat rule %s.",
                        this.clientid, infraction
                    );
                }
                return true;
            }
        }
        return false;
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
        message?: string,
        ...fmt: any[]
    ): Promise<void> {
        if (this.disconnected)
            return;

        if (fmt.length) {
            return this.disconnect(reason, util.format(message, ...fmt));
        }

        this.room?.handleRemoteLeave(this);
        this.disconnected = true;

        await this.emit(
            new ClientDisconnectEvent(
                this,
                reason || DisconnectReason.None
            )
        );

        this.send(
            new DisconnectPacket(
                reason,
                message,
                true
            )
        );

        if (reason) {
            this.server.logger.info(
                "Client with ID %s disconnected. Reason: %s (%s)",
                this.clientid, DisconnectReason[reason],
                reason === DisconnectReason.Custom
                    ? message || "(No message)"
                    : (DisconnectMessages as any)[reason]
            );
        } else {
            this.server.logger.info(
                "Client with ID %s disconnected.",
                this.clientid
            );
        }

        this.server.clients.delete(this.remote.address + ":" + this.remote.port);
    }

    async joinError(
        reason: DisconnectReason,
        message?: string,
        ...fmt: any[]
    ): Promise<void> {
        if (this.disconnected)
            return;
            
        if (fmt.length) {
            return this.joinError(reason, util.format(message, ...fmt));
        }

        await this.send(
            new ReliablePacket(
                this.getNextNonce(),
                [
                    new JoinGameMessage(
                        reason,
                        message
                    )
                ]
            )
        );
        
        if (reason) {
            this.server.logger.info(
                "Client with ID %s failed to host or join game. Reason: %s (%s)",
                this.clientid, DisconnectReason[reason],
                reason === DisconnectReason.Custom
                    ? message || "(No message)"
                    : (DisconnectMessages as any)[reason]
            );
        } else {
            this.server.logger.info(
                "Client with ID %s disconnected.",
                this.clientid
            );
        }
    }
}