import dgram from "dgram";
import winston from "winston";
import vorpal from "vorpal";
import chalk from "chalk";
import resolveFrom from "resolve-from";

import { DisconnectReason, GameState } from "@skeldjs/constant";

import {
    AcknowledgePacket,
    BaseRootPacket,
    CloseMessage,
    DisconnectPacket,
    EndGameMessage,
    GameDataMessage,
    GameDataToMessage,
    GameOptions,
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
    Int2Code,
    V2Gen
} from "@skeldjs/util";

import {
    PluginSide,
    ReactorHandshakeMessage,
    ReactorMessage,
    ReactorModDeclarationMessage
} from "@skeldjs/reactor";

import { EventEmitter } from "@skeldjs/events";

import { VorpalConsole } from "./util/VorpalConsoleTransport";

import { HindenburgConfig } from "./interfaces/HindenburgConfig";
import { ModdedHelloPacket } from "./packets/ModdedHelloPacket";

import { MessageSide, Room, RoomEvents } from "./room/Room";

import {
    PluginHandler,
    ChatCommandHandler
} from "./handlers";

import { Connection, ClientMod, SentPacket } from "./Connection";

export type ReliableSerializable = BaseRootPacket & { nonce: number };

export type WorkerEvents = RoomEvents;

export class Worker extends EventEmitter<WorkerEvents> {
    config: HindenburgConfig;

    /**
     * Winston logger for this server.
     */
    logger: winston.Logger;
    
    vorpal: vorpal;

    /**
     * The server's plugin loader.
     */
    pluginHandler: PluginHandler;

    chatCommandHandler: ChatCommandHandler;

    /**
     * The UDP socket that all clients connect to.
     */
    socket: dgram.Socket;

    /**
     * All client connections connected to this server, mapped by their address:port,
     * see {@link Connection.address}.
     */
    connections: Map<string, Connection>;

    /**
     * All rooms created on this server, mapped by their game code as an integer.
     * 
     * See {@link Worker.createRoom}
     */
    rooms: Map<number, Room>;

    /**
     * The packet decoder used to decode incoming udp packets.
     */
    decoder: PacketDecoder<Connection>;

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
        config: Partial<HindenburgConfig>,
        /**
         * Directory to load plugins from.
         */
        pluginDir: string
    ) {
        super();

        this.config = {
            plugins: {},
            ...config,
            anticheat: {
                store: "file",
                file: "./bans.txt",
                rules: {

                },
                ...config.anticheat
            }
        };
        
        this.vorpal = new vorpal;

        this.logger = winston.createLogger({
            transports: [
                new VorpalConsole(this.vorpal, {
                    format: winston.format.combine(
                        winston.format.splat(),
                        winston.format.colorize(),
                        winston.format.label({ label: "worker" /* todo: handle cluster name & node id */ }),
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

        this.pluginHandler = new PluginHandler(this, pluginDir);
        this.chatCommandHandler = new ChatCommandHandler(this);

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

            this.logger.info("%s connected",
                connection);

            // todo: if reactor is disabled and client is using it, disconnect client
            // todo: if reactor is required and client is not using it, disconnect client

            if (connection.usingReactor) {
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
                
                const entries = [...this.pluginHandler.loadedPlugins];
                for (let i = 0; i < entries.length; i++) {
                    const [, plugin] = entries[i];
                    
                    connection.sendPacket(
                        new ReliablePacket(
                            connection.getNextNonce(),
                            [
                                new ReactorMessage(
                                    new ReactorModDeclarationMessage(
                                        i,
                                        plugin.meta.id,
                                        plugin.meta.version || "1.0.0",
                                        PluginSide.Both // todo: let plugin choose?
                                    )
                                )
                            ]
                        )
                    );
                }
            }
        });

        this.decoder.on(ReactorModDeclarationMessage, (message, direction, connection) => {
            if (connection.mods.length >= connection.numMods)
                return;

            const clientMod = new ClientMod(
                message.netid,
                message.modid,
                message.version
            );

            connection.mods.push(clientMod);

            this.logger.info("Got mod from %s: %s",
                connection, clientMod);
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
            const room = await this.createRoom(roomCode, message.options);

            this.logger.info("%s created room %s",
                connection, room)

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
                    this.logger.warn("%s attempted to join %s but they were banned",
                        connection, foundRoom);
                    return connection.disconnect(DisconnectReason.Banned);
                }
                if (foundRoom.players.size >= foundRoom.options.maxPlayers) {
                    this.logger.warn("%s attempted to join %s but it was full",
                        connection, foundRoom);
                    return connection.joinError(DisconnectReason.GameFull);
                }
                if (foundRoom.state === GameState.Started) { // Use Room.state when that is implemented
                    this.logger.warn("%s attempted to join %s but the game had already started",
                        connection, foundRoom);
                    return connection.joinError(DisconnectReason.GameStarted);
                }
                this.logger.info("%s joining room %s",
                    connection, foundRoom);
                await foundRoom.handleJoin(connection);
            } else {
                this.logger.info("%s attempted to join %s but there was no room with that code",
                    connection, Int2Code(message.code));
                return connection.joinError(DisconnectReason.GameNotFound);
            }
        });

        this.decoder.on(GameDataMessage, async (message, direction, connection) => {
            if (!connection.player)
                return;

            await connection.room!.decoder.emitDecoded(message, direction, connection.player);
            // todo: remove canceled packets (e.g. from the anti-cheat)
            // todo: handle movement packets with care
            // todo: pipe packets to the room for state
            await connection.room!.broadcastMessages(
                message.children
                    .filter(child => !child.canceled)
            , [], undefined, [connection.player]);
        });

        this.decoder.on(GameDataToMessage, async (message, direction, connection) => {
            if (!connection.player)
                return;

            const recipientPlayer = connection.room!.players.get(message.recipientid);

            if (!recipientPlayer?.connection)
                return;

            await connection.room!.broadcastMessages(message._children, [], [recipientPlayer]);
        });

        this.decoder.on(StartGameMessage, async (message, direction, connection) => {
            if (!connection.room)
                return;

            if (!connection.player?.isHost) {
                // todo: proper anti-cheat config
                return connection.disconnect(DisconnectReason.Hacking);
            }

            connection.room.decoder.emitDecoded(message, direction, connection.player);
            await connection.room.broadcastMessages([], [
                new StartGameMessage(connection.room.code.id)
            ]);
        });

        this.decoder.on(EndGameMessage, async (message, direction, connection) => {
            if (!connection.room)
                return;

            if (!connection.player?.isHost) {
                // todo: proper anti-cheat config
                return connection.disconnect(DisconnectReason.Hacking);
            }

            connection.room.decoder.emitDecoded(message, direction, connection.player);
            await connection.room.broadcastMessages([], [
                new EndGameMessage(connection.room.code.id, message.reason, false)
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

        this.vorpal.delimiter(chalk.greenBright("hindenburg~$")).show();
        this.vorpal
            .command("dc", "Forcefully disconnect a client or several clients.")
            .option("--clientid <clientid>", "client id of the client to disconnect")
            .option("--username <username>", "username of the client(s) to disconnect")
            .option("--address <ip address>", "ip address of the client(s) to disconnect")
            .option("--room <room code>", "room code of the client(s) to disconnect")
            .option("--reason <reason>", "reason for why to disconnect the client")
            .option("--ban", "Ban this client")
            .action(async args => {
                const reason = (typeof args.options.reason === "number"
                    ? args.options.reason
                    : DisconnectReason[args.options.reason]) || DisconnectReason.None;

                const codeId = args.options.room ? Code2Int(args.options.room) : 0;
                let num_disconnected = 0;

                for (const [ , connection ] of this.connections) {
                    if (
                        connection.clientId === args.options.clientid ||
                        connection.username === args.options.username ||
                        connection.rinfo.address === args.options.address ||
                        connection.room?.code.id === codeId
                    ) {
                        // todo: ban the client if args.options.ban is true
                        await connection.disconnect(reason);
                        num_disconnected++;
                    }
                }

                this.logger.info("Disconnected %s clients.", num_disconnected);
            });

        this.vorpal
            .command("destroy <room code>", "Destroy and remove a room from the server.")
            .option("--reason <reason>", "reason to destroy this room",)
            .autocomplete({
                data: async () => {
                    return [...this.rooms.keys()].map(room => Int2Code(room).toLowerCase());
                }
            })
            .action(async args => {
                const reason = (typeof args.options.reason === "number"
                    ? args.options.reason
                    : DisconnectReason[args.options.reason]) || DisconnectReason.ServerRequest;

                const codeId = Code2Int(args["room code"].toUpperCase());
                const room = this.rooms.get(codeId);

                if (room) {
                    await room.destroy(reason as unknown as number);
                } else {
                    this.logger.error("Couldn't find room: " + args["room code"]);
                }
            });

        this.vorpal
            .command("load <import>", "Load a plugin by its import relative to the base plugin directory.")
            .action(async args => {
                try {
                    const importPath = resolveFrom(this.pluginHandler.pluginDir, args.import);
                    try {
                        await this.pluginHandler.loadPlugin(importPath);
                    } catch (e) {
                        this.logger.warn("Failed to load plugin from '%s': %s", args.import, e);
                    }
                } catch (e) {
                    const importPath = resolveFrom(this.pluginHandler.pluginDir, "./" + args.import);
                    try {
                        await this.pluginHandler.loadPlugin(importPath);
                    } catch (e) {
                        this.logger.warn("Failed to load plugin from '%s': %s", args.import, e);
                    }
                }
            });

        this.vorpal
            .command("unload <plugin id>", "Unload a plugin.")
            .action(async args => {
                const pluginId: string = args["plugin id"];
                const loadedPlugin = this.pluginHandler.loadedPlugins.get(pluginId);

                if (loadedPlugin) {
                    this.pluginHandler.unloadPlugin(loadedPlugin);
                } else {    
                    this.logger.error("Plugin not loaded: %s", pluginId);
                }
            });

        this.vorpal
            .command("list <something>", "List something about the server, \"clients\", \"rooms\" or \"plugins\".")
            .action(async args => {
                switch (args.something) {
                case "clients":
                    this.logger.info("%s client(s)", this.connections.size);
                    for (const [ , client ] of this.connections) {
                        this.logger.info("* %s", client);
                    }
                    break;
                case "rooms":
                    this.logger.info("%s room(s)", this.rooms.size);
                    for (const [ , room ] of this.rooms) {
                        this.logger.info("* %s", room);
                    }
                    break;
                case "plugins":
                    this.logger.info("%s plugins(s) loaded", this.pluginHandler.loadedPlugins.size);
                    for (const [ , plugin ] of this.pluginHandler.loadedPlugins) {
                        this.logger.info("* %s", plugin.meta.id);
                    }
                    break;
                default:
                    this.logger.error("Expected either \"clients\", \"rooms\" or \"plugins\": %s", args.something);
                    break;
                }
            });
            
        this.vorpal
            .command("list mods <client id>", "List all of a client's mods.")
            .action(async args => {
                for (const [ , connection ] of this.connections) {
                    if (
                        connection.clientId === args["client id"]
                    ) {
                        this.logger.info("%s has %s mod(s)", connection, connection.mods.length);
                        for (const mod of connection.mods) {
                            this.logger.info("* %s", mod);
                        }
                        return;
                    }
                }
                this.logger.error("Couldn't find client with id: " + args["client id"]);
            });
            
        this.vorpal
            .command("list players <room code>", "List players in a room.")
            .action(async args => {
                const codeId = Code2Int(args["room code"].toUpperCase());
                const room = this.rooms.get(codeId);

                if (room) {
                    this.logger.info("%s player(s) in %s", room.players.size, room);
                    for (const [ , player ] of room.players) {
                        this.logger.info("* %s", player);
                    }
                } else {
                    this.logger.error("Couldn't find room: " + args["room code"]);
                }
            });

        this.vorpal
            .command("broadcast <message...>", "Broadcast a message to all rooms, or a specific room.")
            .option("--room <room code>", "the room to send a message to")
            .action(async args => {
                const message = args.message.join(" ");
                const roomCode = args.options.room
                    ? Code2Int(args.options.room.toUpperCase())
                    : 0;

                const foundRoom = this.rooms.get(roomCode);

                if (foundRoom) {
                    foundRoom.sendChat(message, {
                        side: MessageSide.Left
                    });
                    this.logger.info("Broadcasted message to %s player(s)", foundRoom.players.size);
                    return;
                } else if (roomCode) {
                    this.logger.error("Couldn't find room: " + args.options.room);
                }

                let numPlayers = 0;
                for (const [ , room ] of this.rooms) {
                    room.sendChat(message, {
                        side: MessageSide.Left
                    });
                    numPlayers += room.players.size;
                }
                this.logger.info("Broadcasted message to %s player(s)", numPlayers);
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
    getOrCreateConnection(rinfo: dgram.RemoteInfo): Connection {
        const fmt = rinfo.address + ":" + rinfo.port;
        const cached = this.connections.get(fmt);
        if (cached)
            return cached;

        const clientid = this.getNextClientId();
        const connection = new Connection(this, rinfo, clientid);
        this.connections.set(fmt, connection);
        return connection;
    }

    /**
     * Remove a connection from this server.
     * 
     * Note that this does not notify the client of the connection that they have
     * been disconnected, see {@link Connection.disconnect}.
     * @param connection The connection to remove.
     */
    removeConnection(connection: Connection) {
        this.connections.delete(connection.rinfo.address + ":" + connection.rinfo.port);
        this.logger.info("Remove %s", connection);
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
    async sendPacket(connection: Connection, packet: BaseRootPacket) {
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

                try {
                    if (cachedConnection) {
                        if (parsedReliable.nonce !== undefined && !(parsedPacket instanceof AcknowledgePacket)) {
                            if (parsedReliable.nonce <= cachedConnection.lastNonce) {
                                this.logger.warn("%s is behind (got %s, last nonce was %s)",
                                    cachedConnection, parsedReliable.nonce, cachedConnection.lastNonce);
                                return;
                            }
                            cachedConnection.lastNonce = parsedReliable.nonce;
                        }

                        await this.decoder.emitDecoded(parsedPacket, MessageDirection.Serverbound, cachedConnection);
                    } else {
                        if (!(parsedReliable instanceof ModdedHelloPacket))
                            return;

                        const connection = cachedConnection || new Connection(this, rinfo, this.getNextClientId());
                        if (!cachedConnection)
                            this.connections.set(rinfo.address + ":" + rinfo.port, connection);

                        if (parsedReliable.nonce !== undefined) {
                            connection.lastNonce = parsedReliable.nonce;
                        }

                        await this.decoder.emitDecoded(parsedPacket, MessageDirection.Serverbound, connection);
                    }
                } catch (e) {
                    const connection = this.getOrCreateConnection(rinfo);
                    this.logger.error("Error occurred while processing packet from %s: %s",
                        connection, e);
                }
            } else {
                const connection = this.getOrCreateConnection(rinfo);
                this.logger.error("%s sent an unknown root packet", connection);
            }
        } catch (e) {
            const connection = this.getOrCreateConnection(rinfo);
            this.logger.error("%s sent a malformed packet", connection);
            console.log(e);
        }
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
        
        let roomCode = V2Gen();
        while (this.rooms.get(roomCode))
            roomCode = V2Gen();

        return roomCode;
    }

    /**
     * Create a room on this server.
     * @param code The game code for the room, see {@link Worker.generateRoomCode}
     * to generate one.
     * @param options Game options for the room.
     * @returns The created room.
     */
    async createRoom(code: number, options: GameOptions) {
        if (this.rooms.has(code))
            throw new Error("A room with code '" + Int2Code(code) + "' already exists.");

        const createdRoom = new Room(this, options);
        await createdRoom.code.set(code);
        this.rooms.set(code, createdRoom);

        return createdRoom;
    }
}