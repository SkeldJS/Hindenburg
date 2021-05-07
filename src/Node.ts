import dgram from "dgram";
import winston from "winston";
import ioredis from "ioredis";

import {
    AcknowledgePacket,
    BaseRootPacket,
    DisconnectPacket,
    HelloPacket,
    MessageDirection,
    PacketDecoder, PingPacket, ReliablePacket, Serializable
} from "@skeldjs/protocol";

import { DisconnectReason, SendOption } from "@skeldjs/constant";
import { HazelReader, HazelWriter, VersionInfo } from "@skeldjs/util";

import { EventData, EventEmitter } from "@skeldjs/events";

import { Client } from "./Client";
import { ModdedHelloPacket, ReactorHandshakeMessage, ReactorMessage, ReactorMessageTag } from "./packets";
import { ReactorModDeclarationMessage } from "./packets/ReactorModDeclaration";

export interface ReliableSerializable extends Serializable {
    nonce: number;
}

export interface AnticheatValue {
    penalty?: "ban"|"disconnect"|"ignore";
    strikes?: number;
    banDuration?: number;
}

export interface AnticheatConfig {
    versions: string[];
    banMessage: string;
    maxConnectionsPerIp: number;
    checkSettings: boolean|AnticheatValue;
    checkObjectOwnership: boolean|AnticheatValue;
    hostChecks: boolean|AnticheatValue;
    malformedPackets: boolean|AnticheatValue;
    massivePackets: boolean|AnticheatValue;
}

export interface RedisServerConfig {
    host: string;
    port: number;
    password?: string;
}

export interface HindenburgServerConfig {
    ip: string;
    port: number;
}

export interface HindenburgMasterServerConfig {
    nodes: {
        ip: string;
        port: number;
    }[];
    ip: string;
    port: number;
}

export interface ModInfo {
    id: string;
    version: string;
}

export interface ReactorConfig {
    mods: ModInfo[];
}

export interface HindenburgConfig {
    reactor: boolean|ReactorConfig;
    serverName: string;
    serverVersion: string;
    anticheat: AnticheatConfig;
    node: HindenburgServerConfig;
    master: HindenburgMasterServerConfig;
    redis: RedisServerConfig;
}

export class HindenburgNode<T extends EventData = any> extends EventEmitter<T> {
    logger: winston.Logger;

    config: HindenburgConfig;

    socket: dgram.Socket;

    decoder: PacketDecoder<Client>;
    clients: Map<string, Client>;

    allowed_versions: VersionInfo[];
    
    redis: ioredis.Redis;
    
    private _incr_clientid: number;

    constructor(config: Partial<HindenburgConfig>) {
        super();

        this.logger = winston.createLogger({
            transports: [
                new winston.transports.Console({
                    format: winston.format.combine(
                        winston.format.splat(),
                        winston.format.colorize(),
                        winston.format.simple(),
                        winston.format.label({ label: "Hindenburg" }),
                    ),
                }),
                new winston.transports.File({
                    filename: "logs.txt",
                    format: winston.format.combine(
                        winston.format.splat(),
                        winston.format.simple()
                    )
                })
            ]
        });

        this.config = {
            reactor: false,
            serverName: "Hindenburg",
            serverVersion: "1.0.0",
            ...config,
            anticheat: {
                versions: ["2020.4.2"],
                banMessage: "You were banned for %s for hacking.",
                maxConnectionsPerIp: 2,
                checkSettings: true,
                checkObjectOwnership: true,
                hostChecks: true,
                malformedPackets: false,
                massivePackets: {
                    penalty: "disconnect",
                    strikes: 3
                },
                ...config.anticheat
            },
            master: {
                nodes: [
                    {
                        ip: "127.0.0.1",
                        port: 22123
                    }
                ],
                ip: "127.0.0.1",
                port: 22023,
                ...config.master
            },
            node: {
                ip: "127.0.0.1",
                port: 22123,
                ...config.node
            },
            redis: {
                host: "127.0.0.1",
                port: 6379,
                ...config.redis
            }
        }

        this.decoder = new PacketDecoder;
        this.socket = dgram.createSocket("udp4");

        this.redis = new ioredis(this.config.redis);

        this.clients = new Map;
        this.allowed_versions = this.config.anticheat.versions.map(version => VersionInfo.from(version));

        this._incr_clientid = 0;

        if (this.config.reactor) {
            this.decoder.register(ModdedHelloPacket);
            this.decoder.register(ReactorMessage);
            this.decoder.register(ReactorHandshakeMessage);
            this.decoder.register(ReactorModDeclarationMessage);
            
            this.decoder.on([ ReliablePacket, ModdedHelloPacket, PingPacket ], (message, direction, client) => {
                client.received.unshift(message.nonce);
                client.received.splice(8);
                client.ack(message.nonce);
            });
            
            this.decoder.on(ModdedHelloPacket, (message, direction, client) => {
                if (client.identified)
                    return;

                const versions = this.allowed_versions.map(version => version.encode());
                if (versions.includes(message.clientver.encode())) {
                    client.identified = true;
                    client.username = message.username;
                    client.version = message.clientver;

                    this.logger.info(
                        "Client with ID %s identified as %s (version %s) (%s mods)",
                        client.clientid, client.username, client.version, message.modcount
                    );

                    client.send(
                        new ReliablePacket(
                            client.getNextNonce(),
                            [
                                new ReactorMessage(
                                    new ReactorHandshakeMessage(
                                        this.config.serverName,
                                        this.config.serverVersion,
                                        0
                                    )
                                )
                            ]
                        )
                    );
                } else {
                    client.disconnect(DisconnectReason.IncorrectVersion);

                    this.logger.info(
                        "Client with ID %s attempted to identify with an invalid version (%s)",
                        client.clientid, message.clientver
                    )
                }
            });

            this.decoder.on(ReactorModDeclarationMessage, (message, direction, client) => {
                if (!client.mods)
                    client.mods = [];

                client.mods.push({
                    id: message.modid,
                    version: message.version
                });

                this.logger.info(
                    "Got mod from client with ID %s: %s (%s)",
                    client.clientid, message.modid, message.version
                );
            });
        } else {
            this.decoder.on([ ReliablePacket, HelloPacket, PingPacket ], (message, direction, client) => {
                client.received.unshift(message.nonce);
                client.received.splice(8);
                client.ack(message.nonce);
            });
            
            this.decoder.on(HelloPacket, (message, direction, client) => {
                if (client.identified)
                    return;

                const versions = this.allowed_versions.map(version => version.encode());
                if (versions.includes(message.clientver.encode())) {
                    client.identified = true;
                    client.username = message.username;
                    client.version = message.clientver;

                    this.logger.info(
                        "Client with ID %s identified as %s (version %s)",
                        client.clientid, client.username, client.version
                    );
                } else {
                    client.disconnect(DisconnectReason.IncorrectVersion);

                    this.logger.info(
                        "Client with ID %s attempted to identify with an invalid version (%s)",
                        client.clientid, message.clientver
                    )
                }
            });
        }

        this.decoder.on(DisconnectPacket, (message, direction, client) => {
            client.disconnect();
        });

        this.decoder.on(AcknowledgePacket, (message, direction, client) => {
            for (const sent of client.sent) {
                if (sent.nonce === message.nonce) {
                    sent.acked = true;
                }
            }

            for (const missing of message.missingPackets) {
                // client.ack(client.received[missing]);
            }
        });
    }

    get ip() {
        return "";
    }

    checkMods(client: Client) {
        if (this.config.reactor) {
            if (client.mods) {
                if (typeof this.config.reactor !== "boolean" && this.config.reactor.mods) {
                    for (const mod of client.mods) {
                        const found = this.config.reactor.mods.find(m => m.id === mod.id);
                        if (found) {
                            if (found.version !== mod.version) {
                                this.logger.warn(
                                    "Client with ID %s attempted to connect with invalid version of mod " + mod.id + " (" + mod.version + ").",
                                    client.clientid
                                );
                                client.disconnect(DisconnectReason.Custom, "Invalid version for mod " + mod.id + " loaded: " + mod.version + ".");
                                return false;
                            }
                        } else {
                            this.logger.warn(
                                "Client with ID %s attempted to connect with invalid mod " + mod.id + " (" + mod.version + ").",
                                client.clientid
                            );
                            client.disconnect(DisconnectReason.Custom, "Invalid mod loaded: " + mod.id + " (" + mod.version + ").");
                            return false;
                        }
                    }
                    for (const mod of this.config.reactor.mods) {
                        const found = client.mods.find(m => m.id === mod.id);
                        if (!found) {
                            this.logger.warn(
                                "Client with ID %s has missing mod " + mod.id + ".",
                                client.clientid
                            );
                            client.disconnect(DisconnectReason.Custom, "Missing mod: " + mod.id + " (" + mod.version + ").");
                            return false;
                        }
                    }

                }
            } else {
                this.logger.warn(
                    "Client with ID %s failed to declare mods.",
                    client.clientid
                );
                client.disconnect(DisconnectReason.Custom, "Failed to declare mods.");
                return false;
            }
        }
        return true;
    }
    
    getNextClientID() {
        this._incr_clientid++;

        return this._incr_clientid;
    }


    private _send(remote: dgram.RemoteInfo, message: Buffer) {
        return new Promise<number>((resolve, reject) => {
            this.socket.send(message, remote.port, remote.address, (err, bytes) => {
                if (err) {
                    return reject(err);
                }

                resolve(bytes);
            });
        });
    }

    async send(client: Client, message: Serializable) {
        const writer = HazelWriter.alloc(512);
        writer.uint8(message.tag);
        writer.write(message, MessageDirection.Clientbound, this.decoder);
        writer.realloc(writer.cursor);

        if (message.tag !== SendOption.Acknowledge && "nonce" in message) {
            const reliable = message as ReliableSerializable;
            const bytes = await this._send(client.remote, writer.buffer);
            
            const sent = {
                nonce: reliable.nonce,
                acked: false
            };

            client.sent.push(sent);
            client.sent.splice(8);
            
            let attempts = 0;
            const interval: NodeJS.Timeout = setInterval(async () => {
                if (sent.acked) {
                    return clearInterval(interval);
                } else {
                    if (
                        !client.sent.find(
                            (packet) => sent.nonce === packet.nonce
                        )
                    ) {
                        return clearInterval(interval);
                    }

                    if (++attempts > 8) {
                        await client.disconnect();
                        clearInterval(interval);
                    }

                    if (
                        (await this._send(client.remote, writer.buffer)) ===
                        null
                    ) {
                        await client.disconnect();
                    }
                }
            }, 1500);

            return bytes;
        } else {
            return await this._send(client.remote, writer.buffer);
        }
    }

    async handleInitial(parsed: Serializable, client: Client) {
        void parsed, client;
    }

    async onMessage(message: Buffer, remote: dgram.RemoteInfo) {
        const reader = HazelReader.from(message);
        
        if (message.byteLength > 1024) {
            const client = this.clients.get(remote.address + ":" + remote.port);
            if (client) {
                if (client.penalize("massivePackets")) {
                    return;
                }
            } else {
                const new_client = new Client(this, remote, this.getNextClientID());
                this.clients.set(remote.address + ":" + remote.port, new_client);

                if (new_client.penalize("massivePackets")) {
                    return;
                }
            }
        }

        try {
            const parsed = this.decoder.parse(reader, MessageDirection.Serverbound);
            const client = this.clients.get(remote.address + ":" + remote.port);

            if (client) {
                if (parsed.tag !== SendOption.Acknowledge && "nonce" in parsed) {
                    const reliable = parsed as ReliableSerializable;

                    if (reliable.nonce <= client.last_nonce) {
                        return;
                    }

                    client.last_nonce = reliable.nonce;
                }

                try {
                    this.decoder.emitDecoded(parsed, MessageDirection.Serverbound, client);
                } catch (e) {
                    this.logger.error("%s", e.stack);
                }
            } else if (parsed.tag === SendOption.Hello) {
                const new_client = new Client(this, remote, this.getNextClientID());
                this.clients.set(remote.address + ":" + remote.port, new_client);
                
                this.logger.info(
                    "Created client from %s:%s with ID %s",
                    new_client.remote.address, new_client.remote.port, new_client.clientid
                );
                
                await this.handleInitial(parsed, new_client);
            }
        } catch (e) {
            this.logger.info("Client " + remote.address + ":" + remote.port + " sent a malformed packet.");

            const client = this.clients.get(remote.address + ":" + remote.port);
            if (client) {
                if (client.penalize("malformedPackets")) {
                    return;
                }
            } else {
                const new_client = new Client(this, remote, this.getNextClientID());
                this.clients.set(remote.address + ":" + remote.port, new_client);

                if (new_client.penalize("malformedPackets")) {
                    return;
                }
            }
        }
    }
}