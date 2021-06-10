import dgram from "dgram";

import {
    AcknowledgePacket,
    BaseRootPacket,
    DisconnectPacket,
    EndGameMessage,
    GameDataMessage,
    GameDataToMessage,
    HostGameMessage,
    JoinGameMessage,
    KickPlayerMessage,
    MessageDirection,
    PacketDecoder,
    PingPacket,
    ReliablePacket,
    StartGameMessage
} from "@skeldjs/protocol";

import {
    Code2Int,
    HazelWriter,
    Int2Code
} from "@skeldjs/util";

import {
    ReactorHandshakeMessage,
    ReactorMessage,
    ReactorModDeclarationMessage
} from "@skeldjs/reactor";

import { HindenburgConfig } from "./interfaces/HindenburgConfig";
import { ModdedHelloPacket } from "./packets/ModdedHelloPacket";

import { ClientConnection, ClientMod, SentPacket } from "./Connection";
import { Room } from "./Room";
import { DisconnectReason } from "@skeldjs/core";

export type ReliableSerializable = BaseRootPacket & { nonce: number };

export class Worker {
    /**
     * The UDP socket that all clients connect to.
     */
    socket: dgram.Socket;

    /**
     * All client connections connected to this server, mapped by their address:port,
     * see {@link ClientConnection.address}.
     */
    connections: Map<string, ClientConnection>;
    /**
     * All rooms created on this server, mapped by their game code as an integer.
     * 
     * See {@link Worker.createRoom}
     */
    rooms: Map<number, Room>;

    /**
     * The packet decoder used to decode incoming udp packets.
     */
    decoder: PacketDecoder<ClientConnection>;

    /**
     * The last client ID that was used.
     * 
     * Used for {@link Worker.getNextClientId} to get an incrementing client
     * ID.
     */
    lastClientId: number;

    constructor(
        /**
         * The name of the cluster that this node is apart of.
         */
        public readonly clusterName: string,
        /**
         * The ID of this node relative to the cluster.
         */
        public readonly nodeId: number,
        /**
         * The global configuration for Hindenburg.
         */
        public readonly config: HindenburgConfig
    ) {
        this.socket = dgram.createSocket("udp4");
        this.socket.on("message", this.handleMessage.bind(this));

        this.lastClientId = 0;
        this.connections = new Map;
        this.rooms = new Map;

        this.decoder = new PacketDecoder;

        this.decoder.register(
            ModdedHelloPacket,
            ReactorMessage,
            ReactorHandshakeMessage,
            ReactorModDeclarationMessage
        );

        this.decoder.on([ ReliablePacket, ModdedHelloPacket, PingPacket ], async (message, direction, connection) => {
            connection.receivedPackets.unshift(message.nonce);
            connection.receivedPackets.splice(8);

            await connection.sendPacket(
                new AcknowledgePacket(
                    message.nonce,
                    []
                )
            );
        });

        this.decoder.on(ModdedHelloPacket, async (message, direction, connection) => {
            if (connection.hasIdentified)
                return;

            connection.hasIdentified = true;
            connection.usingReactor = !message.isNormalHello();
            connection.username = message.username;
            connection.clientVersion = message.clientver;

            if (connection.usingReactor) {
                connection.numMods = message.modcount!;
            }

            console.log("connection from %s identified as %s (v%s)",
                connection.address, connection.username, connection.clientVersion);

            // todo: if reactor is disabled and client is using it, disconnect client
            // todo: if reactor is required and client is not using it, disconnect client

            if (connection.usingReactor) {
                // todo: send loaded plugins
                await connection.sendPacket(
                    new ReliablePacket(
                        connection.getNextNonce(),
                        [
                            new ReactorMessage(
                                new ReactorHandshakeMessage("Hindenburg", "1.0.0", 0)
                            )
                        ]
                    )
                );
            }
        });

        this.decoder.on(ReactorModDeclarationMessage, (message, direction, connection) => {
            if (connection.mods.length >= connection.numMods) {
                // todo: warn if client is sending too many mods
            }

            const clientMod = new ClientMod(
                message.netid,
                message.modid,
                message.version
            );

            connection.mods.push(clientMod);

            // todo: log received mod from client
        });

        this.decoder.on(DisconnectPacket, async (message, direciton, connection) => {
            if (!connection.sentDisconnect)
                await connection.disconnect();

            this.removeConnection(connection);
        });

        this.decoder.on(AcknowledgePacket, (message, direction, connection) => {
            for (const sentPacket of connection.sentPackets) {
                if (sentPacket.nonce === message.nonce) {
                    sentPacket.acked = true;
                    connection.roundTripPing = Date.now() - sentPacket.sentAt;
                }
            } 
        });

        this.decoder.on(HostGameMessage, async (message, direction, connection) => {
            if (connection.room)
                return;

            const roomCode = this.generateRoomCode(6); // todo: handle config for 4 letter game codes
            const room = this.createRoom(roomCode);
            room.setHost(connection);

            await connection.sendPacket(
                new ReliablePacket(
                    connection.getNextNonce(),
                    [
                        new HostGameMessage(roomCode)
                    ]
                )
            );
        });

        this.decoder.on(JoinGameMessage, async (message, direction, connection) => {
            if (connection.room)
                return;

            const foundRoom = this.rooms.get(message.code);

            if (foundRoom) {
                if (foundRoom.bans.has(connection.address)) {
                    return connection.disconnect(DisconnectReason.Banned);
                }
                await foundRoom.handleJoin(connection);
            }
        });

        this.decoder.on(GameDataMessage, async (message, direction, connection) => {
            if (!connection.room)
                return;


            // todo: remove canceled packets (e.g. from the anti-cheat)
            // todo: handle movement packets with care
            // todo: pipe packets to the room for state measuring
            await connection.room.broadcastMessages(message.children, [], undefined, [connection]);
        });

        this.decoder.on(GameDataToMessage, async (message, direction, connection) => {
            if (!connection.room)
                return;

            const recipientConnection = connection.room.connections.get(message.recipientid);

            if (!recipientConnection)
                return;

            await connection.room.broadcastMessages(message._children, [], [recipientConnection]);
        });

        this.decoder.on([ StartGameMessage, EndGameMessage ], async (message, direction, connection) => {
            if (!connection.room)
                return;

            if (!connection.player?.isHost) {
                // todo: proper anti-cheat config
                return connection.disconnect(DisconnectReason.Hacking);
            }

            await connection.room.broadcastMessages([], [
                new StartGameMessage(connection.room.code)
            ]);
        });

        this.decoder.on([ KickPlayerMessage ], async (message, direction, connection) => {
            if (!connection.room || !connection.player)
                return;

            if (!connection.player.isHost) {
                // todo: proper anti-cheat config
                return connection.disconnect(DisconnectReason.Hacking);
            }

            const targetPlayer = connection.room.players.get(message.clientid);

            if (!targetPlayer)
                return;

            await targetPlayer.kick(message.banned);
        });

        // todo: handle report player

        setInterval(() => {
            for (const [ , connection ] of this.connections) {
                connection.sendPacket(
                    new PingPacket(
                        connection.getNextNonce()
                    )
                );
                for (const sent of connection.sentPackets) {
                    if (!sent.acked) {
                        if (Date.now() - sent.sentAt > 500) {
                            this._sendPacket(connection.rinfo, sent.buffer)
                            sent.sentAt = Date.now();
                        }
                    }
                }
            }
        }, 2500);
    }

    /**
     * Bind the socket to the configured port.
     */
    listen() {
        return new Promise<void>(resolve => {
            this.socket.bind(22023);

            this.socket.once("listening", () => {
                resolve();
            });
        });
    }

    /**
     * Get the next available client ID.
     * @example
     * ```ts
     * console.log(worker.getNextClientId()); // => 1
     * console.log(worker.getNextClientId()); // => 2
     * console.log(worker.getNextClientId()); // => 3
     * console.log(worker.getNextClientId()); // => 4
     * console.log(worker.getNextClientId()); // => 5
     * ```
     */
    getNextClientId() {
        return ++this.lastClientId;
    }

    /**
     * Retrieve or create a connection based on its remote information received
     * from a [socket `message` event](https://nodejs.org/api/dgram.html#dgram_event_message).
     */
    getOrCreateConnection(rinfo: dgram.RemoteInfo): ClientConnection {
        const fmt = rinfo.address + ":" + rinfo.port;
        const cached = this.connections.get(fmt);
        if (cached)
            return cached;

        const clientid = this.getNextClientId();
        const connection = new ClientConnection(this, rinfo, clientid);
        this.connections.set(fmt, connection);
        return connection;
    }

    /**
     * Remove a connection from this server.
     * 
     * Note that this does not notify the client of the connection that they have
     * been disconnected, see {@link ClientConnection.disconnect}.
     * @param connection The connection to remove.
     */
    removeConnection(connection: ClientConnection) {
        this.connections.delete(connection.rinfo.address + ":" + connection.rinfo.port);
    }

    private _sendPacket(remote: dgram.RemoteInfo, buffer: Buffer) {
        return new Promise((resolve, reject) => {
            this.socket.send(buffer, remote.port, remote.address, (err, bytes) => {
                if (err) return reject(err);

                resolve(bytes);
            });
        });
    }

    /**
     * Serialize and reliable or unreliably send a packet to a client.
     * 
     * For reliable packets, packets sent will be reliably recorded and marked
     * for re-sending if the client does not send an acknowledgement for the
     * packet.
     * @param connection The connection to send this packet to.
     * @param packet The root packet to send.
     * @example
     * ```ts
     * worker.sendPacket(connection,
     *   new ReliablePacket(
     *     connection.getNextNonce(),
     *     [
     *       new HostGameMessage("ALBERT")
     *     ]
     *   )
     * );
     * ```
     */
    async sendPacket(connection: ClientConnection, packet: BaseRootPacket) {
        const reliablePacket = packet as ReliableSerializable;

        const writer = HazelWriter.alloc(512);
        writer.uint8(packet.tag);
        writer.write(packet, MessageDirection.Clientbound, this.decoder);
        writer.realloc(writer.cursor);

        if (reliablePacket.nonce !== undefined && !(packet instanceof AcknowledgePacket)) {
            connection.sentPackets.unshift(
                new SentPacket(
                    reliablePacket.nonce,
                    writer.buffer,
                    Date.now(),
                    false
                )
            );
            connection.sentPackets.splice(8);
            await this._sendPacket(connection.rinfo, writer.buffer);
        } else {
            await this._sendPacket(connection.rinfo, writer.buffer);
        }
    }

    /**
     * Handle a message being received via the udp socket.
     * @param buffer The raw data buffer that was received.
     * @param rinfo Information about the remote that sent this data.
     */
    async handleMessage(buffer: Buffer, rinfo: dgram.RemoteInfo) {
        try {
            const parsedPacket = this.decoder.parse(buffer, MessageDirection.Serverbound);

            if (parsedPacket) {
                const parsedReliable = parsedPacket as ReliableSerializable;

                const cachedConnection = this.connections.get(rinfo.address + ":" + rinfo.port);

                if (cachedConnection) {
                    const connection = cachedConnection || new ClientConnection(this, rinfo, this.getNextClientId());
                    if (!cachedConnection)
                        this.connections.set(rinfo.address + ":" + rinfo.port, connection);
                        
                    if (parsedReliable.nonce !== undefined && !(parsedPacket instanceof AcknowledgePacket)) {
                        if (parsedReliable.nonce <= connection.lastNonce) {
                            // todo: warn that client is behind.
                            return;
                        }
                        connection.lastNonce = parsedReliable.nonce;
                    }

                    await this.decoder.emitDecoded(parsedPacket, MessageDirection.Serverbound, connection);
                } else {
                    if (!(parsedReliable instanceof ModdedHelloPacket))
                        return;

                    const connection = cachedConnection || new ClientConnection(this, rinfo, this.getNextClientId());
                    if (!cachedConnection)
                        this.connections.set(rinfo.address + ":" + rinfo.port, connection);

                    await this.decoder.emitDecoded(parsedPacket, MessageDirection.Serverbound, connection);
                }
            } else {
                const connection = this.getOrCreateConnection(rinfo);
                // todo: handle bad packet
            }
        } catch (e) {
            const connection = this.getOrCreateConnection(rinfo);
            void e;
            console.log(e);
            // todo: handle bad packet
        }
    }

    private _generateGameCode(len: number) {
        // todo: better way of generating codes maybe (without String.fromCharCode -> Code2Int)
        
        const chars = [];
        for (let i = 0; i < len; i++) {
            chars.push(~~(Math.random() * 26) + 65);
        }

        const roomName = String.fromCharCode(...chars);
        return Code2Int(roomName);
    }

    /**
     * Generate a 4 or 6 letter room code for a room.
     * @param len The length of the room code, 4 or 6.
     * @returns The generated room code as an integer.
     * @example
     * ```ts
     * // Generate a 4 letter code.
     * const roomCode = generateRoomCode(4);
     * 
     * console.log(roomCode); // => 1246449490
     * ```
     * ```ts
     * // Generate a 6 letter code.
     * const roomCode = generateRoomCode(6);
     * 
     * console.log(roomCode); // => -2007212745
     * ```
     */
    generateRoomCode(len: 4|6) {
        if (len !== 4 && len !== 6) {
            throw new RangeError("Expected to generate a 4 or 6 digit room code.");
        }
        
        let roomCode = this._generateGameCode(len);
        while (this.rooms.get(roomCode))
            roomCode = this._generateGameCode(len);

        return roomCode;
    }

    /**
     * Create a room on this server.
     * @param code The game code for the room, see {@link Worker.generateRoomCode}
     * to generate one.
     * @returns The created room.
     */
    createRoom(code: number) {
        if (this.rooms.has(code))
            throw new Error("A room with code '" + Int2Code(code) + "' already exists.");

        const createdRoom = new Room(this);
        createdRoom.setCode(code);
        this.rooms.set(code, createdRoom);

        return createdRoom;
    }
}