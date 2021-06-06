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
import { BasicEvent, EventEmitter, ExtractEventTypes } from "@skeldjs/events";
import { DisconnectMessages } from "@skeldjs/data";

import { MatchmakerNode, ModInfo } from "./MatchmakerNode";
import { Room } from "./Room";
import { formatSeconds } from "./util/format-seconds";
import { ClientDisconnectEvent } from "./events";
import { AnticheatConfig, AnticheatValue, AnticheatValueConfig } from "./Anticheat";
import { fmtClient } from "./util/format-client";

export interface SentPacket {
    nonce: number;
    acked: boolean;
}

export type ClientEvents = ExtractEventTypes<[
    ClientDisconnectEvent
]>;

export class Client extends EventEmitter<ClientEvents> {
    identified: boolean;
    disconnected: boolean;
    redirectedTo?: string;
    
    username!: string;
    version!: VersionInfo;

    private _incr_nonce: number;
    last_nonce: number;

    received: number[];
    sent: SentPacket[];

    room: Room|null;

    isUsingReactor: boolean;
    mods?: ModInfo[];

    constructor(
        private server: MatchmakerNode,
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

        this.isUsingReactor = false;
    }

    get address() {
        return this.remote.address + ":" + this.remote.port;
    }
    
    async emit<Event extends ClientEvents[keyof ClientEvents]>(
        event: Event
    ): Promise<Event>
    async emit<Event extends BasicEvent>(event: Event): Promise<Event>;
    async emit<Event extends BasicEvent>(event: Event): Promise<Event> {
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

    async penalize<T extends keyof AnticheatConfig>(infraction: T, key?: keyof AnticheatConfig[T]) {
        const config = this.server.config.anticheat[infraction] as AnticheatValue;
        const fmtInfraction = infraction + (key ? "." + key : "");

        if (config) {
            if (typeof config === "boolean") {
                this.disconnect(DisconnectReason.Hacking);
                this.server.logger.warn(
                    "%s was disconnected for anticheat rule %s.",
                    fmtClient(this), fmtInfraction
                );
            } else if (config.penalty !== "ignore") {
                const subConfig = key ? config[key as keyof AnticheatValueConfig] : undefined;

                if (key && (typeof subConfig !== "boolean" || subConfig)) {
                    if (config.strikes && config.strikes > 1) {
                        const strikes = await this.server.redis.incr("infractions." + this.server.listeningIp + "." + this.clientid + "." + infraction);
                        this.server.logger.warn(
                            "%s is on %s strike(s) for anticheat rule %s.",
                            fmtClient(this), strikes, fmtInfraction
                        );
        
                        if (strikes < config.strikes) {
                            return false;
                        }
                    }
    
                    if (config.penalty === "ban") {
                        await this.ban(infraction, config.banDuration || 3600);
                        this.server.logger.warn(
                            "%s was banned for anticheat rule %s for %s.",
                            fmtClient(this), fmtInfraction, formatSeconds(config.banDuration || 3600)
                        );
                    } else {
                        this.disconnect(DisconnectReason.Hacking);
                        this.server.logger.warn(
                            "%s was disconnected for anticheat rule %s.",
                            fmtClient(this), fmtInfraction
                        );
                    }
                    return true;
                }
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
                "ID %s is behind %s packets.",
                fmtClient(this), unacked.length
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
        reason?: DisconnectReason|string,
        ...fmt: any[]
    ): Promise<void> {
        if (this.disconnected)
            return;
            
        if (typeof reason === "string" && fmt.length) {
            return this.disconnect(util.format(reason, ...fmt));
        }
        
        this.room?.handleRemoteLeave(this);
        this.disconnected = true;

        const dcReason = typeof reason === "string"
            ? DisconnectReason.Custom
            : reason;

        const dcMessage = typeof reason === "string" ? reason : undefined;

        this.send(
            new DisconnectPacket(
                dcReason,
                dcMessage,
                true
            )
        );

        if (dcReason) {
            this.server.logger.info(
                "%s disconnected. Reason: %s (%s)",
                fmtClient(this), DisconnectReason[dcReason],
                dcReason === DisconnectReason.Custom
                    ? dcMessage || "(No message)"
                    : (DisconnectMessages as any)[dcReason]
            );
        } else {
            this.server.logger.info(
                "%s disconnected.",
                fmtClient(this)
            );
        }

        this.server.clients.delete(this.address);
    }

    async joinError(
        reason: DisconnectReason|string,
        ...fmt: any[]
    ): Promise<void> {
        if (this.disconnected)
            return;
            
        if (typeof reason === "string" && fmt.length) {
            return this.joinError(util.format(reason, ...fmt));
        }

        const dcReason = typeof reason === "string"
            ? DisconnectReason.Custom
            : reason;

        const dcMessage = typeof reason === "string" ? reason : undefined;

        await this.send(
            new ReliablePacket(
                this.getNextNonce(),
                [
                    new JoinGameMessage(
                        dcReason,
                        dcMessage
                    )
                ]
            )
        );
        
        if (dcReason) {
            this.server.logger.info(
                "%s failed to host or join game. Reason: %s (%s)",
                fmtClient(this), DisconnectReason[dcReason],
                dcReason === DisconnectReason.Custom
                    ? dcMessage || "(No message)"
                    : (DisconnectMessages as any)[dcReason]
            );
        } else {
            this.server.logger.info(
                "%s disconnected.",
                fmtClient(this)
            );
        }
    }
}