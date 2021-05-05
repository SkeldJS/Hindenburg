import dgram from "dgram";
import winston from "winston";

import {
    AcknowledgePacket,
    DisconnectPacket,
    HelloPacket,
    HostGameMessage,
    JoinGameMessage,
    MessageDirection,
    PacketDecoder,
    PingPacket,
    ReliablePacket,
    Serializable
} from "@skeldjs/protocol";

import { Code2Int, HazelReader, HazelWriter, VersionInfo } from "@skeldjs/util";
import { DisconnectReason, GameMap, GameState, RootMessageTag, SendOption } from "@skeldjs/constant";

import { Room } from "./Room";
import { Client } from "./Client";

export interface HindenburgServerConfig {
    port: number;
    anticheat: {
        checkSettings: boolean;
    },
    versions: string[]
}

export interface ReliableSerializable extends Serializable {
    nonce: number;
}

export class HindenburgServer {
    logger: winston.Logger;

    decoder: PacketDecoder<Client>;
    socket: dgram.Socket;

    config: HindenburgServerConfig;

    clients: Map<string, Client>;
    rooms: Map<number, Room>;

    allowed_versions: VersionInfo[];

    private _incr_clientid: number;

    constructor(config: Partial<HindenburgServerConfig>) {
        this.logger = winston.createLogger({
            transports: [
                new winston.transports.Console({
                    format: winston.format.combine(
                        winston.format.splat(),
                        winston.format.colorize(),
                        winston.format.simple()
                    ),
                }),
                new winston.transports.File({ filename: "logs.txt" })
            ]
        });

        this.decoder = new PacketDecoder;
        this.socket = dgram.createSocket("udp4");

        this.config = {
            port: 22023,
            versions: ["2020.4.2"],
            ...config,
            anticheat: {
                checkSettings: true,
                ...config.anticheat
            }
        };

        this.clients = new Map;
        this.rooms = new Map;
        
        this._incr_clientid = 0;

        this.allowed_versions = this.config.versions.map(version => VersionInfo.from(version));

        this.decoder.on([ ReliablePacket, HelloPacket, PingPacket ], (message, direction, client) => {
            client.received.unshift(message.nonce);
            client.received.splice(8);
            client.ack(message.nonce);
        });

        this.decoder.on(HelloPacket, (message, direction, client) => {
            const versions = this.allowed_versions.map(version => version.encode());
            if (versions.includes(message.clientver.encode())) {
                client.identified = true;
                client.username = message.username;
                client.version = message.clientver;

                this.logger.log(
                    "info",
                    "Client with ID %s identified as %s (version %s)",
                    client.clientid, client.username, client.version
                );
            } else {
                client.disconnect(DisconnectReason.IncorrectVersion);

                this.logger.log(
                    "warn",
                    "Client with ID %s attempted to identify with an invalid version (%s)",
                    client.clientid, message.clientver
                )
            }
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

        this.decoder.on(HostGameMessage, (message, direction, client) => {
            if (this.config.anticheat.checkSettings) {
                // todo: use GameOptions.isValid
            }

            const chars = [];
            for (let i = 0; i < 6; i++) {
                chars.push(~~(Math.random() * 26) + 65);
            }
            const name = String.fromCharCode(...chars);
            const code = Code2Int(name);

            const room = new Room(this);
            room.settings.patch(message.options);
            room.setCode(code);
            this.rooms.set(code, room);

            this.logger.log(
                "info",
                "Client with ID %s created game %s on %s with %s impostors and %s max players.",
                client.clientid, name,
                GameMap[message.options.map], message.options.numImpostors, message.options.maxPlayers
            );

            client.send(
                new ReliablePacket(
                    client.getNextNonce(),
                    [
                        new HostGameMessage(code)
                    ]
                )
            );
        });

        this.decoder.on(JoinGameMessage, (message, direction, client) => {
            const room = this.rooms.get(message.code);

            if (!room)
                return client.joinError(DisconnectReason.GameNotFound);

            if (room.clients.size >= room.settings.maxPlayers)
                client.joinError(DisconnectReason.GameFull);

            if (room.state === GameState.Started)
                client.joinError(DisconnectReason.GameStarted);

            room.handleJoin(client);
        });
    }

    listen() {
        this.socket.bind(this.config.port);

        this.socket.on("listening", () => {
            this.logger.log("info", "Listening on *:" + this.config.port);
        });

        this.socket.on("message", this.onMessage.bind(this));
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

        if ("nonce" in message) {
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

    onMessage(message: Buffer, remote: dgram.RemoteInfo) {
        const reader = HazelReader.from(message);

        try {
            const parsed = this.decoder.parse(reader, MessageDirection.Serverbound);
            const client = this.clients.get(remote.address + ":" + remote.port);

            if (client) {
                this.decoder.emitDecoded(parsed, MessageDirection.Serverbound, client);
            } else if (parsed.tag !== SendOption.Disconnect) {
                const new_client = new Client(this, remote, this.getNextClientID());
                this.clients.set(remote.address + ":" + remote.port, new_client);

                this.logger.log(
                    "info",
                    "Created client from %s:%s with ID %s",
                    remote.address, remote.port, new_client.clientid
                );

                this.decoder.emitDecoded(parsed, MessageDirection.Serverbound, new_client);
            }
        } catch (e) {
            this.logger.info("Client " + remote.address + ":" + remote.port + " sent a malformed packet.");
        }
    }
}