import dgram from "dgram";
import picomatch from "picomatch";
import chalk from "chalk";
import ioredis from "ioredis";
import winston from "winston";

import {
    AcknowledgePacket,
    DisconnectPacket,
    MessageDirection,
    PacketDecoder,
    ReliablePacket,
    Serializable
} from "@skeldjs/protocol";

import { DisconnectReason, SendOption } from "@skeldjs/constant";
import { HazelReader, HazelWriter, VersionInfo } from "@skeldjs/util";

import { EventData, EventEmitter, ExtractEventTypes } from "@skeldjs/events";

import { Client } from "./Client";

import {
    ModdedHelloPacket,
    PluginSide,
    ReactorHandshakeMessage,
    ReactorMessage,
    ReactorModDeclarationMessage
} from "./packets";

import { LoadBalancerNode } from "./LoadBalancerNode";
import { fmtClient } from "./util/format-client";
import { PluginLoader } from "./plugins/PluginLoader";
import { AnticheatConfig } from "./Anticheat";

export type MatchmakerNodeEvents = ExtractEventTypes<[]>;


export interface RedisServerConfig {
    host: string;
    port: number;
    password?: string;
}

export interface HindenburgClusterConfig {
    name: string;
    ip: string;
    ports: number[];
    allowDirect: boolean;
}

export interface HindenburgLoadBalancerClusterConfig {
    name: string;
    ip: string;
    ports: number[];
}

export interface HindenburgLoadBalancerServerConfig {
    clusters: HindenburgLoadBalancerClusterConfig[];
    ip: string;
    port: number;
}

export interface ModConfig {
    version: string;
    required: boolean;
    banned: boolean;
}

export interface ReactorModConfig {
    [key: string]: string|ModConfig;
}

export interface ReactorConfig {
    mods: ReactorModConfig;
    allowExtraMods: boolean;
    optional: boolean;
}

export interface HindenburgConfig {
    reactor: boolean|ReactorConfig;
    versions: string[];
    anticheat: AnticheatConfig;
    cluster: HindenburgClusterConfig;
    loadbalancer: HindenburgLoadBalancerServerConfig;
    redis: RedisServerConfig;
    plugins: Record<string, boolean|object>;
}

export interface ReliableSerializable extends Serializable {
    nonce: number;
}

export interface ModInfo {
    id: string;
    version: string;
}

export class MatchmakerNode<T extends EventData = any> extends EventEmitter<T> {
    redis: ioredis.Redis;
    logger: winston.Logger;

    config: HindenburgConfig;
    socket: dgram.Socket;

    decoder: PacketDecoder<Client>;
    clients: Map<string, Client>;

    allowed_versions: VersionInfo[];
    
    pluginLoader: PluginLoader;
    
    private _incr_clientid: number;

    constructor(label: string, config: Partial<HindenburgConfig>, pluginDirectory: string) {
        super();

        this.config = {
            reactor: false,
            versions: ["2020.4.2"],
            plugins: {},
            ...config,
            anticheat: {
                banMessage: "You were banned for %s for hacking.",
                maxConnectionsPerIp: 2,
                checkSettings: true,
                checkObjectOwnership: true,
                hostChecks: true,
                invalidFlow: true,
                invalidName: true,
                invalidColor: true,
                malformedPackets: false,
                massivePackets: {
                    penalty: "disconnect",
                    strikes: 3
                },
                ...config.anticheat
            },
            loadbalancer: {
                clusters: [
                    {
                        name: "Cluster",
                        ip: "127.0.0.1",
                        ports: [ 22123 ]
                    }
                ],
                ip: "127.0.0.1",
                port: 22023,
                ...config.loadbalancer
            },
            cluster: {
                name: "Cluster",
                ip: "127.0.0.1",
                ports: [ 22123 ],
                allowDirect: false,
                ...config.cluster
            },
            redis: {
                host: "127.0.0.1",
                port: 6379,
                ...config.redis
            }
        }
        
        this.logger = winston.createLogger({
            transports: [
                new winston.transports.Console({
                    format: winston.format.combine(
                        winston.format.splat(),
                        winston.format.colorize(),
                        winston.format.label({ label }),
                        winston.format.printf(info => {
                            return `[${info.label}] ${info.level}: ${info.message}`;
                        }),
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

        this.redis = new ioredis(this.config.redis);

        this.decoder = new PacketDecoder;
        this.pluginLoader = new PluginLoader(this, pluginDirectory);
        this.socket = dgram.createSocket("udp4");

        this.clients = new Map;
        this.allowed_versions = this.config.versions.map(version => VersionInfo.from(version));

        this._incr_clientid = 0;

        this.decoder.register(
            ModdedHelloPacket,
            ReactorMessage,
            ReactorHandshakeMessage,
            ReactorModDeclarationMessage
        );
        
        this.decoder.on(ModdedHelloPacket, (message, direction, client) => {
            if (client.identified)
                return;
                
            if (message.isNormalHello()) {
                if (this.config.reactor && (typeof this.config.reactor === "boolean" || !this.config.reactor.optional)) {
                    this.logger.warn(
                        "%s identified without reactor loaded.",
                        fmtClient(client)
                    );
                    return client.disconnect("Server requires reactor to be loaded, see <link=\"https://reactor.gg\">reactor.gg</link> for more information.");
                }
            } else {
                if (!this.config.reactor) {
                    return client.disconnect("This server does not support reactor.");
                }
            }

            const versions = this.allowed_versions.map(version => version.encode());
            if (versions.includes(message.clientver.encode())) {
                client.identified = true;
                client.username = message.username;
                client.version = message.clientver;
                client.isUsingReactor = !message.isNormalHello();

                this.logger.info(
                    "%s identified as %s (version %s) (%s mods)",
                    fmtClient(client), client.username, client.version, message.modcount || 0
                );

                client.send(
                    new ReliablePacket(
                        client.getNextNonce(),
                        [
                            new ReactorMessage(
                                new ReactorHandshakeMessage(
                                    "Hindenburg",
                                    process.env.npm_package_version || "1.0.0",
                                    this.pluginLoader.plugins.size
                                )
                            )
                        ]
                    )
                );

                const entries = [...this.pluginLoader.plugins.entries()];
                for (let i = 0; i < entries.length; i++) {
                    const [, plugin] = entries[i];
                    
                    client.send(
                        new ReliablePacket(
                            client.getNextNonce(),
                            [
                                new ReactorMessage(
                                    new ReactorModDeclarationMessage(
                                        0,
                                        plugin.meta.id,
                                        plugin.meta.version || "1.0.0",
                                        plugin.meta.clientSide ? PluginSide.Both : PluginSide.Clientside
                                    )
                                )
                            ]
                        )
                    )
                }
            } else {
                client.disconnect(DisconnectReason.IncorrectVersion);

                this.logger.info(
                    "%s attempted to identify with an invalid version (%s)",
                    fmtClient(client), message.clientver
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
                "Got mod from %s: %s (%s)",
                fmtClient(client), chalk.green(message.modid), message.version
            );
        });

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

    get listeningIp() {
        return "";
    }

    isLoadBalancer(): this is LoadBalancerNode {
        return false;
    }

    beginListen() {
        return;
    }

    checkClientMods(client: Client) {
        if (typeof this.config.reactor === "object" && client.isUsingReactor) {
            if (client.mods) {
                const entries = Object.entries(this.config.reactor.mods || {});

                for (const [ id, info ] of entries) {
                    const version = typeof info === "string"
                        ? info
                        : info.version;

                    const found = client.mods.find(mod =>
                        mod.id === id
                    );

                    if (found) {
                        if (typeof info !== "string" && info.banned) {
                            client.joinError(
                                "Invalid mod loaded: %s (%s).",
                                found.id, found.version
                            );
                            return false;
                        }

                        if (found.version && !picomatch.isMatch(found.version, version)) {
                            client.joinError(
                                "Invalid version for mod %s: %s (Needs %s).",
                                found.id, found.version, version
                            );
                            return false;
                        }
                    } else {
                        if (typeof info === "string" || info.required) {
                            client.joinError(
                                "Missing mod: %s (%s).",
                                id, version
                            );
                            return false;
                        }
                    }

                    if (!this.config.reactor.allowExtraMods) {
                        for (const mod of client.mods) {
                            if (!this.config.reactor.mods[mod.id]) {
                                client.joinError(
                                    "Invalid mod loaded: %s (%s).",
                                    mod.id, mod.version
                                );
                                return false;
                            }
                        }
                    }
                }
            } else {
                client.disconnect(
                    "Expected mods to be loaded, make sure you have the latest version of Reactor."
                );
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

            client.sent.unshift(sent);
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

    async handleInitialMessage(parsed: Serializable, client: Client) {
        void parsed, client;
    }

    async onMessage(message: Buffer, remote: dgram.RemoteInfo) {
        const reader = HazelReader.from(message);
        
        if (message.byteLength > 1024) {
            const client = this.clients.get(remote.address + ":" + remote.port);
            if (client) {
                if (await client.penalize("massivePackets")) {
                    return;
                }
            } else {
                const new_client = new Client(this, remote, this.getNextClientID());
                this.clients.set(remote.address + ":" + remote.port, new_client);

                if (await new_client.penalize("massivePackets")) {
                    return;
                }
            }
        }

        try {
            const parsed = this.decoder.parse(reader, MessageDirection.Serverbound);
            const client = this.clients.get(remote.address + ":" + remote.port);

            if (!parsed)
                return;

            if (client) {
                if (parsed.tag !== SendOption.Acknowledge && "nonce" in parsed) {
                    const reliable = parsed as ReliableSerializable;
                    
                    if (reliable.nonce <= client.last_nonce) {
                        return;
                    }

                    client.last_nonce = reliable.nonce;

                    client.received.unshift(reliable.nonce);
                    client.received.splice(8);
                    client.ack(reliable.nonce);
                }

                try {
                    await this.decoder.emitDecodedSerial(parsed, MessageDirection.Serverbound, client);
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
                
                await this.handleInitialMessage(parsed, new_client);
            }
        } catch (e) {
            this.logger.info("Client " + remote.address + ":" + remote.port + " sent a malformed packet.");

            const client = this.clients.get(remote.address + ":" + remote.port);
            if (client) {
                if (await client.penalize("malformedPackets")) {
                    return;
                }
            } else {
                const new_client = new Client(this, remote, this.getNextClientID());
                this.clients.set(remote.address + ":" + remote.port, new_client);

                if (await new_client.penalize("malformedPackets")) {
                    return;
                }
            }
        }
    }
}