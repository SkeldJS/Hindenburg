import dgram from "dgram";
import winston from "winston";
import vorpal from "vorpal";
import chalk from "chalk";
import resolveFrom from "resolve-from";

import { DisconnectReason, GameState } from "@skeldjs/constant";

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
import { Lobby, LobbyEvents } from "./lobby";

import {
    ClientBanEvent,
    ClientConnectEvent,
    WorkerBeforeJoinEvent
} from "./api";

const byteSizes = ["bytes", "kb", "mb", "gb", "tb"];
function formatBytes(bytes: number) {
    if (bytes === 0)
        return "0 bytes";
        
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return (bytes / Math.pow(1024, i)).toFixed(2) + " " + byteSizes[i];
}

export type ReliableSerializable = BaseRootPacket & { nonce: number };

export type WorkerEvents = LobbyEvents
    & ExtractEventTypes<[
        ClientBanEvent,
        ClientConnectEvent,
        WorkerBeforeJoinEvent
    ]>;

interface MemoryUsageStamp {
    used: number;
    numLobbies: number;
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
     * All lobbies created on this server, mapped by their game code as an integer.
     * 
     * See {@link Worker.createLobby}
     */
    lobbies: Map<number, Lobby>;

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
        this.lobbies = new Map;

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
            if (connection.lobby)
                return;

            const lobbyCode = this.generateLobbyCode(6); // todo: handle config for 4 letter game codes
            const lobby = await this.createLobby(lobbyCode, message.options);

            this.logger.info("%s created lobby %s",
                connection, lobby)

            await connection.sendPacket(
                new ReliablePacket(
                    connection.getNextNonce(),
                    [
                        new HostGameMessage(lobbyCode)
                    ]
                )
            );
        });

        this.decoder.on(JoinGameMessage, async (message, direction, connection) => {
            if (connection.lobby)
                return;

            const foundLobby = this.lobbies.get(message.code);

            const ev = await this.emit(
                new WorkerBeforeJoinEvent(
                    connection,
                    message.code,
                    foundLobby
                )
            );

            if (ev.canceled)
                return;

            if (!ev.foundLobby) {
                this.logger.info("%s attempted to join %s but there was no lobby with that code",
                    connection, fmtCode(message.code));

                return connection.joinError(DisconnectReason.GameNotFound);
            }

            if (ev.foundLobby.bans.has(connection.address)) {
                this.logger.warn("%s attempted to join %s but they were banned",
                    connection, foundLobby);
                return connection.disconnect(DisconnectReason.Banned);
            }

            if (ev.foundLobby.connections.size >= ev.foundLobby.room.settings.maxPlayers) {
                this.logger.warn("%s attempted to join %s but it was full",
                    connection, foundLobby);
                return connection.joinError(DisconnectReason.GameFull);
            }

            if (ev.foundLobby.state === GameState.Started) { // Use Lobby.state when that is implemented
                this.logger.warn("%s attempted to join %s but the game had already started",
                    connection, foundLobby);
                return connection.joinError(DisconnectReason.GameStarted);
            }
            
            this.logger.info("%s joining lobby %s",
                connection, foundLobby);
            await ev.foundLobby.handleRemoteJoin(connection);
        });

        this.decoder.on(GameDataMessage, async (message, direction, connection) => {
            const player = connection.getPlayer();
            if (!player)
                return;

            const canceled = message.children
                .filter(child => !child.canceled);

            for (const child of canceled) {
                await connection.lobby!.room.decoder.emitDecoded(child, direction, connection);
            }
            
            // todo: handle movement packets with care
            // todo: pipe packets to the lobby for state
            await connection.lobby?.broadcastMessages(
                message.children
                    .filter(child => !child.canceled)
            , [], undefined, [connection]);
        });

        this.decoder.on(GameDataToMessage, async (message, direction, connection) => {
            const player = connection.getPlayer();
            if (!player)
                return;

            const recipientConnection = connection.lobby!.connections.get(message.recipientid);

            if (!recipientConnection)
                return;

            await connection.lobby?.broadcastMessages(message._children, [], [recipientConnection]);
        });

        this.decoder.on(StartGameMessage, async (message, direction, connection) => {
            const player = connection.getPlayer();
            if (!player)
                return;

            if (!player.ishost) {
                // todo: proper anti-cheat config
                return connection.disconnect(DisconnectReason.Hacking);
            }

            connection.lobby?.room.decoder.emitDecoded(message, direction, player);
            await connection.lobby?.broadcastMessages([], [
                new StartGameMessage(connection.lobby.code)
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

            connection.lobby?.room.decoder.emitDecoded(message, direction, player);
            await connection.lobby?.broadcastMessages([], [
                new EndGameMessage(connection.lobby.code, message.reason, false)
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
            const targetConnection = connection.lobby?.lobby.players.get(message.clientid);

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
            .option("--lobby, -c <lobby code>", "lobby code of the client(s) to disconnect")
            .option("--reason, -r <reason>", "reason for why to disconnect the client")
            .option("--ban, -b [duration]", "ban this client, duration in seconds")
            .action(async args => {
                const reason = (typeof args.options.reason === "number"
                    ? args.options.reason
                    : DisconnectReason[args.options.reason]) || DisconnectReason.None;

                const lobbyName = args["lobby code"].toUpperCase();
                const codeId = lobbyName === "LOCAL"
                    ? 0x20
                    : Code2Int(lobbyName);

                let num_disconnected = 0;

                for (const [ , connection ] of this.connections) {
                    if (
                        (Array.isArray(args.options.clientid)
                            ? args.options.clientid.includes(connection.clientId)
                            : connection.clientId === args.options.clientid
                        ) ||
                        connection.username === args.options.username ||
                        connection.rinfo.address === args.options.address ||
                        connection.lobby?.code === codeId
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
            .command("destroy <lobby code>", "Destroy and remove a lobby from the server.")
            .option("--reason, r <reason>", "reason to destroy this lobby",)
            .autocomplete({
                data: async () => {
                    return [...this.lobbies.keys()].map(lobby => fmtCode(lobby).toLowerCase());
                }
            })
            .action(async args => {
                const reason = (typeof args.options.reason === "number"
                    ? args.options.reason
                    : DisconnectReason[args.options.reason]) || DisconnectReason.ServerRequest;

                const lobbyName = args["lobby code"].toUpperCase();
                const codeId = lobbyName === "LOCAL"
                    ? 0x20
                    : Code2Int(lobbyName);

                const lobby = this.lobbies.get(codeId);

                if (lobby) {
                    await lobby.destroy(reason as unknown as number);
                } else {
                    this.logger.error("Couldn't find lobby: " + args["lobby code"]);
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
                    try {
                        const importPath = resolveFrom(this.pluginHandler.pluginDir, "./" + args.import);
                        try {
                            await this.pluginHandler.loadPlugin(importPath);
                        } catch (e) {
                            this.logger.error("Failed to load plugin from '%s': %s", args.import, e);
                        }
                    } catch (e) {
                        this.logger.warn("Could not find plugin %s from %s", args.import, this.pluginHandler.pluginDir);
                    }
                }
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
            .command("list <something>", "List something about the server, \"clients\", \"lobbies\" or \"plugins\".")
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
                case "lobbies":
                    this.logger.info("%s lobby(s)", this.lobbies.size);
                    const lobbies = [...this.lobbies];
                    for (let i = 0; i < lobbies.length; i++) {
                        const [ , lobby ] = lobbies[i];
                        this.logger.info("%s) %s", i + 1, lobby);
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
                    this.logger.error("Expected either \"clients\", \"lobbies\" or \"plugins\": %s", args.something);
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
            .command("list players <lobby code>", "List all players in a lobby.")
            .alias("ls players")
            .action(async args => {
                const lobbyName = args["lobby code"].toUpperCase();
                const codeId = lobbyName === "LOCAL"
                    ? 0x20
                    : Code2Int(lobbyName);
                    
                const lobby = this.lobbies.get(codeId);

                if (lobby) {
                    this.logger.info("%s player(s) in %s", lobby.room.players.size, lobby);
                    const players = [...lobby.room.players];
                    for (let i = 0; i < players.length; i++) {
                        const [ , player ] = players[i];
                        this.logger.info("%s) %s", i + 1, player);
                    }
                } else {
                    this.logger.error("Couldn't find lobby: " + args["lobby code"]);
                }
            });

        this.vorpal
            .command("broadcast <message...>", "Broadcast a message to all lobbies, or a specific lobby.")
            .option("--lobby, -c <lobby code>", "the lobby to send a message to")
            .action(async args => {
                const message = args.message.join(" ");
                const lobbyCode = args.options.lobby
                    ? Code2Int(args.options.lobby.toUpperCase?.())
                    : 0;

                const foundLobby = this.lobbies.get(lobbyCode);

                if (foundLobby) {
                    /*foundLobby.sendChat(message, {
                        side: MessageSide.Left
                    });*/
                    this.logger.info("Broadcasted message to %s player(s)", foundLobby.connections.size);
                    return;
                } else if (lobbyCode) {
                    this.logger.error("Couldn't find lobby: " + args.options.lobby);
                }

                let numPlayers = 0;
                for (const [ , lobby ] of this.lobbies) {
                    /*lobby.sendChat(message, {
                        side: MessageSide.Left
                    });*/
                    numPlayers += lobby.connections.size;
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
                    let numLobbiesAxis = "";
                    for (let i = 0; i < numEntries; i++) {
                        const entryI = numEntries - i;
                        const lobbiesStr = this.memUsages[entryI]
                            ? this.memUsages[entryI].numLobbies + "L"
                            : "";
                        const padded = lobbiesStr.padStart(displayDiff);
                        numLobbiesAxis += padded;
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
                    console.log(margin + numLobbiesAxis);
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
                numLobbies: this.lobbies.size,
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
     * Generate a 4 or 6 letter lobby code for a lobby.
     * @param len The length of the lobby code, 4 or 6.
     * @returns The generated lobby code as an integer.
     * @example
     * ```ts
     * // Generate a 4 letter code.
     * const lobbyCode = generateLobbyCode(4);
     * 
     * console.log(lobbyCode); // => 1246449490
     * ```
     * ```ts
     * // Generate a 6 letter code.
     * const lobbyCode = generateLobbyCode(6);
     * 
     * console.log(lobbyCode); // => -2007212745
     * ```
     */
    generateLobbyCode(len: 4|6) {
        if (len !== 4 && len !== 6) {
            throw new RangeError("Expected to generate a 4 or 6 digit lobby code.");
        }
        
        let lobbyCode = V2Gen();
        while (this.lobbies.get(lobbyCode))
            lobbyCode = V2Gen();

        return lobbyCode;
    }

    /**
     * Create a lobby on this server.
     * @param code The game code for the lobby, see {@link Worker.generateLobbyCode}
     * to generate one.
     * @param options Game options for the lobby.
     * @returns The created lobby.
     */
    async createLobby(code: number, options: GameOptions) {
        if (this.lobbies.has(code))
            throw new Error("A lobby with code '" + Int2Code(code) + "' already exists.");

        const createdLobby = new Lobby(this, options);
        await createdLobby.room.setCode(code);
        this.lobbies.set(code, createdLobby);

        return createdLobby;
    }
}