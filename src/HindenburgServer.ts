import dgram from "dgram";
import winston from "winston";

import { HelloPacket, MessageDirection, PacketDecoder, Serializable } from "@skeldjs/protocol";
import { Room } from "./Room";
import { Client } from "./Client";
import { HazelWriter } from "@skeldjs/util";

export interface HindenburgServerConfig {
    port: number;
    anticheat: {

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

    private _incr_clientid: number;

    constructor(config: Partial<HindenburgServerConfig>) {
        this.logger = winston.createLogger({
            transports: [
                new winston.transports.Console,
                new winston.transports.File({ filename: "logs.txt" })
            ]
        });

        this.decoder = new PacketDecoder;
        this.socket = dgram.createSocket("udp4");

        this.config = {
            port: 22023,
            versions: ["2020.4.2.0"],
            ...config,
            anticheat: {
                ...config.anticheat
            }
        };

        this.clients = new Map;
        this.rooms = new Map;
        
        this._incr_clientid = 0;

        this.decoder.on(HelloPacket, (message, direction, client) => {
            client.identified = true;
            client.username = message.username;
            client.version = client.version;
        });
    }

    listen() {
        this.socket.bind(this.config.port);
    }
    
    getNextClientID() {
        this._incr_clientid++;

        return this._incr_clientid;
    }

    getOrCreateClient(remote: dgram.RemoteInfo) {
        const id = remote.address + ":" + remote.port;
        const cached = this.clients.get(id);

        if (cached) {
            return cached;
        }

        const client = new Client(
            this,
            remote,
            this.getNextClientID()
        );

        this.clients.set(id, client);
        return client;
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

        if ("nonce" in <any>message) {
            const reliable = message as ReliableSerializable;

            client.sent.push({
                nonce: reliable.nonce,
                acked: false
            });

            
        } else {
            return await this._send(client.remote, writer.buffer);
        }
    }

    onMessage(message: Buffer, remote: dgram.RemoteInfo) {
        const client = this.getOrCreateClient(remote);
        try {
            this.decoder.write(message, MessageDirection.Serverbound, client);
        } catch (e) {
            this.logger.info("Client " + client.clientid + " sent a malformed packet.");
        }
    }
}