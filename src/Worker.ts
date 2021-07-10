import dgram from "dgram";
import winston from "winston";
import vorpal from "vorpal";
import chalk from "chalk";
import resolveFrom from "resolve-from";

import { DisconnectReason, GameKeyword, GameState } from "@skeldjs/constant";

import {
    AcknowledgePacket,
    BaseRootPacket,
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

import { EventEmitter, ExtractEventTypes } from "@skeldjs/events";

import { VorpalConsole } from "./util/VorpalConsoleTransport";
import { fmtCode } from "./util/fmtCode";

import { HindenburgConfig } from "./interfaces/HindenburgConfig";
import { ModdedHelloPacket } from "./packets/ModdedHelloPacket";

import { Connection, ClientMod, SentPacket } from "./Connection";

import { PluginHandler, ChatCommandHandler } from "./handlers";
import { Room, RoomEvents, MessageSide } from "./room";

import {
    ClientBanEvent,
    ClientConnectEvent,
    WorkerBeforeCreateEvent,
    WorkerBeforeJoinEvent
} from "./api";
import { recursiveAssign } from "./util/recursiveAssign";
import { recursiveCompare } from "./util/recursiveCompare";
import { ClientLanguage } from "./Connection";

const byteSizes = ["bytes", "kb", "mb", "gb", "tb"];
function formatBytes(bytes: number) {
    if (bytes === 0)
        return "0 bytes";
        
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return (bytes / Math.pow(1024, i)).toFixed(2) + " " + byteSizes[i];
}

export type ReliableSerializable = BaseRootPacket & { nonce: number };

export type WorkerEvents = RoomEvents
    & ExtractEventTypes<[
        ClientBanEvent,
        ClientConnectEvent,
        WorkerBeforeCreateEvent,
        WorkerBeforeJoinEvent
    ]>;

interface MemoryUsageStamp {
    used: number;
    numRooms: number;
    numConnections: number;
}

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

    /**
     * The last 60s of memory usages.
     */
    memUsages: MemoryUsageStamp[];

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
        config: HindenburgConfig,
        /**
         * Directory to load plugins from.
         */
        pluginDir: string
    ) {
        super();

        this.config = config;
        
        this.vorpal = new vorpal;

        this.logger = winston.createLogger({
            transports: [
                new VorpalConsole(this.vorpal, {
                    format: winston.format.combine(
                        winston.format.splat(),
                        winston.format.colorize(),
                        winston.format.label({ label: this.config.clusterName + this.config.nodeId }),
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
        this.pluginHandler.reregisterMessages();

        this.memUsages = [];

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
            connection.language = message.language
            connection.clientVersion = message.clientver;

            if (connection.usingReactor) {
                connection.numMods = message.modcount!;
            }

            this.logger.info("%s connected, language: %s",
                connection, ClientLanguage[connection.language] || "Unknown");

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

            await this.emit(
                new ClientConnectEvent(connection)
            );
        });

        this.decoder.on(ReactorModDeclarationMessage, (message, direction, connection) => {
            if (connection.mods.size >= connection.numMods)
                return;

            const clientMod = new ClientMod(
                message.netid,
                message.modid,
                message.version
            );

            connection.mods.set(clientMod.netid, clientMod);

            if (connection.mods.size === 4) {
                this.logger.info("... Got more mods from %s, use '%s' to see more",
                    connection, chalk.green("list mods " + connection.clientId));
            } else if (connection.mods.size < 4) {
                this.logger.info("Got mod from %s: %s",
                    connection, clientMod);
            }
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

            const ev = await this.emit(
                new WorkerBeforeCreateEvent(
                    connection,
                    message.options
                )
            );

            if (ev.canceled)
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

            const ev = await this.emit(
                new WorkerBeforeJoinEvent(
                    connection,
                    message.code,
                    foundRoom
                )
            );

            if (ev.canceled)
                return;

            if (!ev.alteredRoom) {
                this.logger.info("%s attempted to join %s but there was no room with that code",
                    connection, fmtCode(message.code));

                return connection.joinError(DisconnectReason.GameNotFound);
            }

            if (ev.alteredRoom.bans.has(connection.address)) {
                this.logger.warn("%s attempted to join %s but they were banned",
                    connection, foundRoom);
                return connection.disconnect(DisconnectReason.Banned);
            }

            if (ev.alteredRoom.connections.size >= ev.alteredRoom.room.settings.maxPlayers) {
                this.logger.warn("%s attempted to join %s but it was full",
                    connection, foundRoom);
                return connection.joinError(DisconnectReason.GameFull);
            }

            if (ev.alteredRoom.state === GameState.Started) { // Use Room.state when that is implemented
                this.logger.warn("%s attempted to join %s but the game had already started",
                    connection, foundRoom);
                return connection.joinError(DisconnectReason.GameStarted);
            }
            
            this.logger.info("%s joining room %s",
                connection, foundRoom);
            await ev.alteredRoom.handleRemoteJoin(connection);
        });

        this.decoder.on(GameDataMessage, async (message, direction, connection) => {
            const player = connection.getPlayer();
            if (!player)
                return;

            const canceled = message.children
                .filter(child => !child.canceled);

            for (const child of canceled) {
                await connection.room!.room.decoder.emitDecoded(child, direction, connection);
            }
            
            // todo: handle movement packets with care
            // todo: pipe packets to the room for state
            await connection.room?.broadcastMessages(
                message.children
                    .filter(child => !child.canceled)
            , [], undefined, [connection]);
        });

        this.decoder.on(GameDataToMessage, async (message, direction, connection) => {
            const player = connection.getPlayer();
            if (!player)
                return;

            const recipientConnection = connection.room!.connections.get(message.recipientid);

            if (!recipientConnection)
                return;

            await connection.room?.broadcastMessages(message._children, [], [recipientConnection]);
        });

        this.decoder.on(StartGameMessage, async (message, direction, connection) => {
            const player = connection.getPlayer();
            if (!player)
                return;

            if (!player.ishost) {
                // todo: proper anti-cheat config
                return connection.disconnect(DisconnectReason.Hacking);
            }

            connection.room?.room.decoder.emitDecoded(message, direction, player);
            await connection.room?.broadcastMessages([], [
                new StartGameMessage(connection.room.code)
            ]);
        });

        this.decoder.on(EndGameMessage, async (message, direction, connection) => {
            const player = connection.getPlayer();
            if (!player)
                return;

            if (!player.ishost) {
                // todo: proper anti-cheat config
                return connection.disconnect(DisconnectReason.Hacking);
            }

            connection.room?.room.decoder.emitDecoded(message, direction, player);
            await connection.room?.broadcastMessages([], [
                new EndGameMessage(connection.room.code, message.reason, false)
            ]);
        });

        this.decoder.on([ KickPlayerMessage ], async (message, direction, connection) => {
            const player = connection.getPlayer();
            if (!player)
                return;

            if (!player.ishost) {
                // todo: proper anti-cheat config
                return connection.disconnect(DisconnectReason.Hacking);
            }
/*
            const targetConnection = connection.room?.room.players.get(message.clientid);

            if (!targetConnection)
                return;

            await targetConnection.kick(message.banned);
*/
        });

        this.vorpal.delimiter(chalk.greenBright("hindenburg~$")).show();
        this.vorpal
            .command("dc", "Forcefully disconnect a client or several clients.")
            .option("--clientid, -i <clientid>", "client id(s) of the client(s) to disconnect")
            .option("--username, -u <username>", "username of the client(s) to disconnect")
            .option("--address, -a <ip address>", "ip address of the client(s) to disconnect")
            .option("--room, -c <room code>", "room code of the client(s) to disconnect")
            .option("--reason, -r <reason>", "reason for why to disconnect the client")
            .option("--ban, -b [duration]", "ban this client, duration in seconds")
            .action(async args => {
                const reason = (typeof args.options.reason === "number"
                    ? args.options.reason
                    : DisconnectReason[args.options.reason]) || DisconnectReason.None;

                const roomName = args["room code"]?.toUpperCase();
                const codeId = roomName && (roomName === "LOCAL"
                    ? 0x20
                    : Code2Int(roomName));

                let num_disconnected = 0;

                for (const [ , connection ] of this.connections) {
                    if (
                        (Array.isArray(args.options.clientid)
                            ? args.options.clientid.includes(connection.clientId)
                            : connection.clientId === args.options.clientid
                        ) ||
                        connection.username === args.options.username ||
                        connection.rinfo.address === args.options.address ||
                        connection.room?.code === codeId
                    ) {
                        if (args.options.ban) {
                            await this.emit(
                                new ClientBanEvent(
                                    connection,
                                    DisconnectReason[reason as any],
                                    parseInt(args.options.ban) || 3600
                                )
                            );
                        }
                        await connection.disconnect(reason);
                        num_disconnected++;
                    }
                }

                this.logger.info("Disconnected %s clients.", num_disconnected);
            });

        this.vorpal
            .command("destroy <room code>", "Destroy and remove a room from the server.")
            .option("--reason, r <reason>", "reason to destroy this room",)
            .autocomplete({
                data: async () => {
                    return [...this.rooms.keys()].map(room => fmtCode(room).toLowerCase());
                }
            })
            .action(async args => {
                const reason = (typeof args.options.reason === "number"
                    ? args.options.reason
                    : DisconnectReason[args.options.reason]) || DisconnectReason.ServerRequest;

                const roomName = args["room code"].toUpperCase();
                const codeId = roomName === "LOCAL"
                    ? 0x20
                    : Code2Int(roomName);

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
                this.pluginHandler.resolveLoadPlugin(args.import);
            });

        this.vorpal
            .command("unload <plugin id>", "Unload a plugin.")
            .action(async args => {
                const pluginId: string = args["plugin id"];
                const loadedPlugin = 
                    typeof pluginId === "number"
                    ? [...this.pluginHandler.loadedPlugins][pluginId - 1]?.[1]
                    : this.pluginHandler.loadedPlugins.get(pluginId);

                if (loadedPlugin) {
                    this.pluginHandler.unloadPlugin(loadedPlugin);
                } else {    
                    this.logger.error("Plugin not loaded: %s", pluginId);
                }
            });

        this.vorpal
            .command("list <something>", "List something about the server, \"clients\", \"rooms\" or \"plugins\".")
            .alias("ls")
            .action(async args => {
                switch (args.something) {
                case "clients":
                    this.logger.info("%s client(s)", this.connections.size);
                    const connections = [...this.connections];
                    for (let i = 0; i < connections.length; i++) {
                        const [ , connection ] = connections[i];
                        this.logger.info("%s) %s", i + 1, connection);
                    }
                    break;
                case "rooms":
                    this.logger.info("%s room(s)", this.rooms.size);
                    const rooms = [...this.rooms];
                    for (let i = 0; i < rooms.length; i++) {
                        const [ , room ] = rooms[i];
                        this.logger.info("%s) %s", i + 1, room);
                    }
                    break;
                case "plugins":
                    this.logger.info("%s plugins(s) loaded", this.pluginHandler.loadedPlugins.size);
                    const loadedPlugins = [...this.pluginHandler.loadedPlugins];
                    for (let i = 0; i < loadedPlugins.length; i++) {
                        const [ , plugin ] = loadedPlugins[i];
                        this.logger.info("%s) %s", i + 1, plugin.meta.id);
                    }
                    break;
                default:
                    this.logger.error("Expected either \"clients\", \"rooms\" or \"plugins\": %s", args.something);
                    break;
                }
            });
            
        this.vorpal
            .command("list mods <client id>", "List all of a client's mods.")
            .alias("ls mods")
            .action(async args => {
                for (const [ , connection ] of this.connections) {
                    if (
                        connection.clientId === args["client id"]
                    ) {
                        this.logger.info("%s has %s mod(s)", connection, connection.mods.size);
                        const mods = [...connection.mods];
                        for (let i = 0; i < mods.length; i++) {
                            const [ , mod ] = mods[i];
                            this.logger.info("%s) %s", i + 1, mod)
                        }
                        return;
                    }
                }
                this.logger.error("Couldn't find client with id: " + args["client id"]);
            });
            
        this.vorpal
            .command("list players <room code>", "List all players in a room.")
            .alias("ls players")
            .action(async args => {
                const roomName = args["room code"].toUpperCase();
                const codeId = roomName === "LOCAL"
                    ? 0x20
                    : Code2Int(roomName);
                    
                const room = this.rooms.get(codeId);

                if (room) {
                    this.logger.info("%s player(s) in %s", room.room.players.size, room);
                    const players = [...room.room.players];
                    for (let i = 0; i < players.length; i++) {
                        const [ , player ] = players[i];
                        this.logger.info("%s) %s", i + 1, player);
                    }
                } else {
                    this.logger.error("Couldn't find room: " + args["room code"]);
                }
            });

        this.vorpal
            .command("broadcast <message...>", "Broadcast a message to all rooms, or a specific room.")
            .option("--room, -c <room code>", "the room to send a message to")
            .action(async args => {
                const message = args.message.join(" ");
                const roomCode = args.options.room
                    ? Code2Int(args.options.room.toUpperCase?.())
                    : 0;

                const foundRoom = this.rooms.get(roomCode);

                if (foundRoom) {
                    foundRoom.sendChat(message, {
                        side: MessageSide.Left
                    });
                    this.logger.info("Broadcasted message to %s player(s)", foundRoom.connections.size);
                    return;
                } else if (roomCode) {
                    this.logger.error("Couldn't find room: " + args.options.room);
                }

                let numPlayers = 0;
                for (const [ , room ] of this.rooms) {
                    room.sendChat(message, {
                        side: MessageSide.Left
                    });
                    numPlayers += room.connections.size;
                }
                this.logger.info("Broadcasted message to %s player(s)", numPlayers);
            });

        this.vorpal
            .command("mem", "View the memory usage of this server.")
            .option("--graph", "View a formatted graph of the last 60s of memory usage.")
            .action(async args => {
                if (args.options.graph) {
                    const numEntries = 60000 / pingInterval;
                    const numRows = 8;
                    const numColumns = 125;
                    const displayDiff = numColumns / numEntries;

                    const displaySeconds = new Array(numEntries).fill(0).map((_, i) => 58000 - Math.floor(i * pingInterval));
                    const secondsXAxis = displaySeconds.map((ms, i) => {
                        const secondsStr = (~~(ms / 1000)).toString();
                        const padded = secondsStr.padStart(displayDiff);
                        return padded;
                    }).join("");
                    let numRoomsAxis = "";
                    for (let i = 0; i < numEntries; i++) {
                        const entryI = numEntries - i;
                        const roomsStr = this.memUsages[entryI]
                            ? this.memUsages[entryI].numRooms + "L"
                            : "";
                        const padded = roomsStr.padStart(displayDiff);
                        numRoomsAxis += padded;
                    }
                    let numConnectionsAxis = "";
                    for (let i = 0; i < numEntries; i++) {
                        const entryI = numEntries - i;
                        const connectionsStr = this.memUsages[entryI]
                            ? this.memUsages[entryI].numConnections + "C"
                            : "";
                        const padded = connectionsStr.padStart(displayDiff);
                        numConnectionsAxis += padded;
                    }

                    const maxUsageUnrounded = this.memUsages.reduce((prev, cur) => cur.used > prev ? cur.used : prev, 0);
                    const maxUsage = Math.round(maxUsageUnrounded / 5242880) * 5242880;
                    const maxUsageFmt = formatBytes(maxUsage);

                    const marginWidth = maxUsageFmt.length + 1;
                    const margin = " ".repeat(marginWidth);

                    const rows = new Array(numRows).fill(0).map(_ => new Array(marginWidth + numColumns).fill(" "));

                    for (let i = 0; i < this.memUsages.length; i++) {
                        const entry = this.memUsages[i];
                        const displayI = numEntries - i;
                        const displayColumn = Math.floor((displayI * displayDiff) - displayDiff);
                        const usagePerc = (entry.used / maxUsage);
                        const displayRow = numRows - Math.floor(Math.min(usagePerc * numRows, numRows));
                        rows[displayRow][marginWidth + displayColumn] = "-";
                    }

                    const latest = this.memUsages[0];
                    if (latest) {
                        const usagePerc = (latest.used / maxUsage);
                        const displayRow = numRows - Math.floor(Math.min(usagePerc * numRows, numRows));
                        for (let i = 0; i < rows[displayRow].length; i++) {
                            if (rows[displayRow][i] !== "-") {
                                rows[displayRow].splice(i, 1, chalk.green("-"));
                            }
                        }
                        
                        const latestUsageFmt = formatBytes(latest.used);

                        rows[displayRow].push(" ", ...chalk.green(latestUsageFmt));
                    }
                    
                    for (let i = 0; i < rows.length; i += 2) {
                        const yAxisMem = (maxUsage / rows.length) * (rows.length - i);
                        const memFmt = formatBytes(yAxisMem);
                        rows[i].splice(0, memFmt.length, ...memFmt.split(""));
                    }

                    console.log(rows.map(row => row.join("")).join("\n"));
                    console.log(margin + secondsXAxis);
                    console.log(margin + numRoomsAxis);
                    console.log(margin + numConnectionsAxis);
                } else {
                    const usage = process.memoryUsage();
    
                    this.logger.info("Using: %s",
                        chalk.green(formatBytes(usage.heapUsed)));
                        
                    this.logger.info("Allocated: %s",
                        chalk.green(formatBytes(usage.heapTotal)));
                }
            });

        // todo: handle report player

        const pingInterval = 2000;
        setInterval(() => {
            const numEntries = 60000 / pingInterval;
            const usage = process.memoryUsage();
            this.memUsages.unshift({
                used: usage.heapUsed,
                numRooms: this.rooms.size,
                numConnections: this.connections.size
            });
            this.memUsages.splice(numEntries);

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
        }, pingInterval);
    }

    /**
     * Bind the socket to the configured port.
     */
    listen(port: number) {
        return new Promise<void>(resolve => {
            this.socket.bind(port);

            this.socket.once("listening", () => {
                this.logger.info("Listening on *:" + port);
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

    updateConfig(config: Partial<HindenburgConfig>) {
        if (config.socket && config.socket?.port !== this.config.socket.port) {
            this.socket.close();
            this.socket = dgram.createSocket("udp4");
            this.listen(config.socket.port);
        }

        if (config.plugins) {
            const pluginKeys = Object.keys(config.plugins);
            for (const key of pluginKeys) {
                const loadedPlugin = this.pluginHandler.loadedPlugins.get(key);

                if (!config.plugins[key]) {
                    this.pluginHandler.unloadPlugin(key);
                } else {
                    if (!loadedPlugin) {
                        this.pluginHandler.resolveLoadPlugin(key);
                        continue;
                    }

                    if (!recursiveCompare(config.plugins[key], this.config.plugins[key])) {
                        loadedPlugin.setConfig(config.plugins[key]);
                    }
                }
            }
        }

        recursiveAssign(this.config, config, { removeKeys: true });
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
                    this.logger.error("Error occurred while processing packet from %s:",
                        connection);
                    console.log(e);
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
        await createdRoom.room.setCode(code);
        this.rooms.set(code, createdRoom);

        return createdRoom;
    }
}