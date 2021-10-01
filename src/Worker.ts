import dgram from "dgram";
import winston from "winston";
import vorpal from "vorpal";
import chalk from "chalk";
import minimatch from "minimatch";

import {
    DisconnectReason,
    Language,
    GameState,
    GameKeyword,
    TaskBarUpdate,
    KillDistance,
    GameMap,
    SendOption
} from "@skeldjs/constant";

import {
    AcknowledgePacket,
    AlterGameMessage,
    BaseRootPacket,
    DisconnectPacket,
    EndGameMessage,
    GameDataToMessage,
    GameListing,
    GameSettings,
    GetGameListMessage,
    HostGameMessage,
    JoinGameMessage,
    KickPlayerMessage,
    MessageDirection,
    PacketDecoder,
    PingPacket,
    ReliablePacket,
    RpcMessage,
    StartGameMessage
} from "@skeldjs/protocol";

import {
    Code2Int,
    HazelWriter,
    Int2Code,
    V1Gen,
    V2Gen,
    VersionInfo
} from "@skeldjs/util";

import {
    ModPluginSide,
    ReactorHandshakeMessage,
    ReactorMessage,
    ReactorMod,
    ReactorModDeclarationMessage
} from "@skeldjs/reactor";

import { EventEmitter, ExtractEventTypes } from "@skeldjs/events";

import { VorpalConsole } from "./util/VorpalConsoleTransport";
import { recursiveAssign } from "./util/recursiveAssign";
import { recursiveCompare } from "./util/recursiveCompare";
import { recursiveClone } from "./util/recursiveClone";
import { fmtCode } from "./util/fmtCode";
import { chunkArr } from "./util/chunkArr";

import { HindenburgConfig, RoomsConfig, MessageSide } from "./interfaces";
import { ModdedHelloPacket } from "./packets/ModdedHelloPacket";

import { Connection, ClientMod, SentPacket } from "./Connection";
import { Room } from "./Room";
import { Perspective } from "./Perspective";
import { RoomEvents, SpecialClientId } from "./BaseRoom";

import {
    ClientBanEvent,
    ClientConnectEvent,
    RoomCreateEvent,
    WorkerBeforeCreateEvent,
    WorkerBeforeJoinEvent
} from "./api";

import { PluginLoader, ChatCommandHandler } from "./handlers";
import {
    ReactorRpcMessage,
    GameDataMessage,
    UnknownGameDataMessage,
    ReactorPluginDeclarationMessage
} from "./packets";

import i18n from "./i18n";

const byteSizes = ["bytes", "kb", "mb", "gb", "tb"];
function formatBytes(bytes: number) {
    if (bytes === 0)
        return "0 bytes";

    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return (bytes / Math.pow(1024, i)).toFixed(2) + " " + byteSizes[i];
}

export type ReliableSerializable = BaseRootPacket & { nonce: number };

export interface PacketContext {
    sender: Connection,
    reliable: boolean;
}

export type WorkerEvents = RoomEvents
    & ExtractEventTypes<[
        ClientBanEvent,
        ClientConnectEvent,
        WorkerBeforeCreateEvent,
        WorkerBeforeJoinEvent
    ]>;

export class Worker extends EventEmitter<WorkerEvents> {
    config: HindenburgConfig; // todo: maybe create a config class? could handle things like checking if a version is valid
    validVersions: number[];

    /**
     * Winston logger for this server.
     */
    logger: winston.Logger;

    /**
     * Vorpal instance responsible for handling interactive CLI.
     */
    vorpal: vorpal;

    /**
     * The server's plugin loader.
     */
    pluginLoader: PluginLoader;

    /**
     * Chat command handler responsible for... handling registered chat commands
     * and parsing chat message commands.
     */
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
    decoder: PacketDecoder<PacketContext>;

    /**
     * The last client ID that was used.
     *
     * Used for {@link Worker.getNextClientId} to get an incrementing client
     * ID.
     */
    lastClientId: number;

    pingInterval: NodeJS.Timeout;

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
        this.validVersions = this.config.versions.map(version => VersionInfo.from(version).encode());

        this.vorpal = new vorpal;

        this.logger = winston.createLogger({
            levels: {
                error: 0,
                debug: 1,
                warn: 2,
                data: 3,
                info: 4,
                verbose: 5,
                silly: 6,
                custom: 7
            },
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

        this.pluginLoader = new PluginLoader(this, pluginDir);
        this.chatCommandHandler = new ChatCommandHandler(this);

        this.socket = dgram.createSocket("udp4");
        this.socket.on("message", this.handleMessage.bind(this));

        this.lastClientId = 0;
        this.connections = new Map;
        this.rooms = new Map;

        this.decoder = new PacketDecoder;
        this.pluginLoader.resetMessages();
        this.pluginLoader.resetMessageHandlers();
        this.pluginLoader.resetChatCommands();

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
                        connection.remoteInfo.address === args.options.address ||
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
                const importPath = this.pluginLoader.resolveImportPath(args.import);

                if (importPath) {
                    const pluginCtr = await this.pluginLoader.importPlugin(importPath);
                    if (this.pluginLoader.loadedPlugins.has(pluginCtr.meta.id))
                        this.pluginLoader.unloadPlugin(pluginCtr.meta.id);

                    await this.pluginLoader.loadPlugin(pluginCtr);
                } else {
                    this.logger.error("Couldn't find installed plugin: " + args.import);
                }
            });

        this.vorpal
            .command("unload <plugin id>", "Unload a plugin.")
            .action(async args => {
                const pluginId: string = args["plugin id"];
                const loadedPlugin =
                    typeof pluginId === "number"
                        ? [...this.pluginLoader.loadedPlugins][pluginId - 1]?.[1]
                        : this.pluginLoader.loadedPlugins.get(pluginId);

                if (loadedPlugin) {
                    this.pluginLoader.unloadPlugin(loadedPlugin);
                } else {
                    this.logger.error("Plugin not loaded: %s", pluginId);
                }
            });

        this.vorpal
            .command("list <something>", "List something about the server, \"clients\", \"rooms\" or \"plugins\".")
            .alias("ls")
            .action(async args => {
                if (args.something === "clients") {
                    this.logger.info("%s client(s)", this.connections.size);
                    const connections = [...this.connections];
                    for (let i = 0; i < connections.length; i++) {
                        const [ , connection ] = connections[i];
                        this.logger.info("%s) %s", i + 1, connection);
                    }
                } else if (args.something === "rooms") {
                    this.logger.info("%s room(s)", this.rooms.size);
                    const rooms = [...this.rooms];
                    for (let i = 0; i < rooms.length; i++) {
                        const [ , room ] = rooms[i];
                        this.logger.info("%s) %s", i + 1, room);
                    }
                } else if (args.something === "plugins") {
                    this.logger.info("%s plugins(s) loaded", this.pluginLoader.loadedPlugins.size);
                    const loadedPlugins = [...this.pluginLoader.loadedPlugins];
                    for (let i = 0; i < loadedPlugins.length; i++) {
                        const [ , plugin ] = loadedPlugins[i];
                        this.logger.info("%s) %s", i + 1, plugin.meta.id);
                    }
                } else {
                    this.logger.error("Expected either \"clients\", \"rooms\" or \"plugins\": %s", args.something);
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
                            this.logger.info("%s) %s", i + 1, mod);
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
                    this.logger.info("%s player(s) in %s", room.players.size, room);
                    const players = [...room.players];
                    for (let i = 0; i < players.length; i++) {
                        const [ , player ] = players[i];
                        this.logger.info("%s) %s", i + 1, player);
                    }
                } else {
                    this.logger.error("Couldn't find room: " + args["room code"]);
                }
            });

        this.vorpal
            .command("list pov <room code>", "List all active perspectives in a room.")
            .alias("ls pov")
            .action(async args => {
                const roomName = args["room code"].toUpperCase();
                const codeId = roomName === "LOCAL"
                    ? 0x20
                    : Code2Int(roomName);

                const room = this.rooms.get(codeId);

                if (room) {
                    this.logger.info("%s perspective(s) in %s", room.activePerspectives.length, room);
                    for (let i = 0; i < room.activePerspectives.length; i++) {
                        const pov = room.activePerspectives[i];
                        this.logger.info("%s) %s", i + 1, pov);
                    }
                } else {
                    this.logger.error("Couldn't find room: " + args["room code"]);
                }
            });

        this.vorpal
            .command("list settings <room code>", "List the game settings of a room.")
            .alias("ls settings")
            .action(async args => {
                const roomName = args["room code"].toUpperCase();
                const codeId = roomName === "LOCAL"
                    ? 0x20
                    : Code2Int(roomName);

                const room = this.rooms.get(codeId);

                if (room) {
                    this.logger.info("Settings for %s:", room);
                    this.logger.info("- max players: %s", room.settings.maxPlayers);
                    this.logger.info("- language: %s", GameKeyword[room.settings.keywords]);
                    this.logger.info("- map: %s", GameMap[room.settings.map]);
                    this.logger.info("- player speed: %s", room.settings.playerSpeed);
                    this.logger.info("- crewmate vision: %s", room.settings.crewmateVision);
                    this.logger.info("- impostor vision: %s", room.settings.impostorVision);
                    this.logger.info("- kill cooldown: %s", room.settings.killCooldown);
                    this.logger.info("- common tasks: %s", room.settings.commonTasks);
                    this.logger.info("- long tasks: %s", room.settings.longTasks);
                    this.logger.info("- short tasks: %s", room.settings.shortTasks);
                    this.logger.info("- # emergencies: %s", room.settings.numEmergencies);
                    this.logger.info("- # impostors: %s", room.settings.numImpostors);
                    this.logger.info("- kill distance: %s", KillDistance[room.settings.killDistance]);
                    this.logger.info("- discussion time: %s", room.settings.discussionTime);
                    this.logger.info("- voting time: %s", room.settings.votingTime);
                    this.logger.info("- is defaults: %s", room.settings.isDefaults);
                    this.logger.info("- emergency cooldown: %s", room.settings.emergencyCooldown);
                    this.logger.info("- confirm ejects: %s", room.settings.confirmEjects);
                    this.logger.info("- visual tasks: %s", room.settings.visualTasks);
                    this.logger.info("- anonymous votes: %s", room.settings.anonymousVotes);
                    this.logger.info("- task bar updates: %s", TaskBarUpdate[room.settings.taskbarUpdates]);
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
            .action(async () => {
                const usage = process.memoryUsage();

                this.logger.info("Using: %s",
                    chalk.green(formatBytes(usage.heapUsed)));

                this.logger.info("Allocated: %s",
                    chalk.green(formatBytes(usage.heapTotal)));
            });

        // todo: handle report player

        const pingInterval = 2000;
        this.pingInterval = setInterval(() => {
            this.doPings();
        }, pingInterval);

        this.registerPacketHandlers();
    }

    /**
     * Bind the socket to the configured port.
     */
    listen(port: number) {
        return new Promise<void>(resolve => {
            this.socket.bind(port);

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
        if (this.connections.delete(connection.remoteInfo.address + ":" + connection.remoteInfo.port)) {
            this.logger.info("Remove %s", connection);
        }
    }

    protected _sendPacket(remote: dgram.RemoteInfo, buffer: Buffer) {
        return new Promise((resolve, reject) => {
            this.socket.send(buffer, remote.port, remote.address, (err, bytes) => {
                if (err) return reject(err);

                resolve(bytes);
            });
        });
    }

    registerMessages() {
        this.decoder.register(
            ModdedHelloPacket,
            ReactorMessage,
            ReactorHandshakeMessage,
            ReactorModDeclarationMessage,
            ReactorPluginDeclarationMessage,
            ReactorRpcMessage,
            GameDataMessage
        );
    }

    registerPacketHandlers() {
        this.decoder.listeners.clear();

        this.decoder.on(ModdedHelloPacket, async (message, direction, { sender }) => {
            if (sender.hasIdentified)
                return;

            sender.receivedPackets.unshift(message.nonce);
            sender.receivedPackets.splice(8);

            await sender.sendPacket(
                new AcknowledgePacket(
                    message.nonce,
                    []
                )
            );

            sender.hasIdentified = true;
            sender.usingReactor = !message.isNormalHello();
            sender.username = message.username;
            sender.language = message.language;
            sender.clientVersion = message.clientver;

            if (sender.usingReactor) {
                sender.numMods = message.modcount!;
            }

            if (!this.validVersions.includes(sender.clientVersion.encode())) {
                this.logger.warn("%s connected with invalid client version: %s",
                    sender, sender.clientVersion.toString());
                sender.disconnect(DisconnectReason.IncorrectVersion);
                return;
            }

            this.logger.info("%s connected, language: %s",
                sender, Language[sender.language] || "Unknown");

            if (sender.usingReactor) {
                if (!this.config.reactor) {
                    sender.disconnect(i18n.reactor_not_enabled_on_server);
                    return;
                }

                await sender.sendPacket(
                    new ReliablePacket(
                        sender.getNextNonce(),
                        [
                            new ReactorMessage(
                                new ReactorHandshakeMessage("Hindenburg", "1.0.0", this.pluginLoader.loadedPlugins.size)
                            )
                        ]
                    )
                );

                const entries = [...this.pluginLoader.loadedPlugins];
                const chunkedPlugins = chunkArr(entries, 4);
                for (let i = 0; i < chunkedPlugins.length; i++) {
                    const chunk = chunkedPlugins[i];

                    sender.sendPacket(
                        new ReliablePacket(
                            sender.getNextNonce(),
                            chunk.map(([ , plugin ]) =>
                                new ReactorMessage(
                                    new ReactorPluginDeclarationMessage(
                                        i,
                                        new ReactorMod(
                                            plugin.meta.id,
                                            plugin.meta.version,
                                            ModPluginSide.Both
                                        )
                                    )
                                )
                            )
                        )
                    );
                }
            } else {
                if (
                    this.config.reactor !== false &&
                    (this.config.reactor === true ||
                    !this.config.reactor.allowNormalClients)
                ) {
                    sender.disconnect(i18n.reactor_required_on_server);
                    return;
                }
            }

            await this.emit(
                new ClientConnectEvent(sender)
            );
        });

        this.decoder.on(ReactorModDeclarationMessage, async (message, direction, { sender }) => {
            if (sender.mods.size >= sender.numMods)
                return;

            const clientMod = new ClientMod(
                message.netId,
                message.mod.modId,
                message.mod.version,
                message.mod.networkSide
            );

            sender.mods.set(clientMod.modId, clientMod);

            if (sender.mods.size === 4) {
                this.logger.info("... Got more mods from %s, use '%s' to see more",
                    sender, chalk.green("list mods " + sender.clientId));
            } else if (sender.mods.size < 4) {
                this.logger.info("Got mod from %s: %s",
                    sender, clientMod);
            }

            if (sender.mods.size >= sender.numMods) {
                if (sender.awaitingToJoin) {
                    await this.attemptJoin(sender, sender.awaitingToJoin);
                    sender.awaitingToJoin = 0;
                }
            }
        });

        this.decoder.on(DisconnectPacket, async (message, direciton, { sender }) => {
            if (!sender.sentDisconnect)
                await sender.disconnect();

            this.removeConnection(sender);
        });

        this.decoder.on(AcknowledgePacket, (message, direction, { sender }) => {
            for (const sentPacket of sender.sentPackets) {
                if (sentPacket.nonce === message.nonce) {
                    sentPacket.acked = true;
                    sender.roundTripPing = Date.now() - sentPacket.sentAt;
                    break;
                }
            }
        });

        this.decoder.on(HostGameMessage, async (message, direction, { sender }) => {
            if (sender.room)
                return;

            const ev = await this.emit(
                new WorkerBeforeCreateEvent(
                    sender,
                    message.options
                )
            );

            if (ev.canceled)
                return;

            const roomCode = this.generateRoomCode(this.config.rooms.gameCodes === "v1" ? 4 : 6);
            const room = await this.createRoom(roomCode, message.options);

            this.logger.info("%s created room %s",
                sender, room);

            await sender.sendPacket(
                new ReliablePacket(
                    sender.getNextNonce(),
                    [
                        new HostGameMessage(roomCode)
                    ]
                )
            );
        });

        this.decoder.on(JoinGameMessage, async (message, direction, { sender }) => {
            if (
                sender.room &&
                sender.room.state !== GameState.Ended &&
                sender.room.code !== message.code // extra checks so you can join back the same game
            )
                return;

            if (sender.mods.size < sender.numMods) {
                this.logger.info("Didn't get all mods from %s, waiting before joining %s",
                    sender, fmtCode(message.code));
                sender.awaitingToJoin = message.code;
                return;
            }

            if (!this.checkClientMods(sender))
                return;

            await this.attemptJoin(sender, message.code);
        });

        this.decoder.on(RpcMessage, async (message, direction, { sender }) => {
            const player = sender.getPlayer();
            if (!player)
                return;

            const reactorRpc = message.data as unknown as ReactorRpcMessage;
            if (reactorRpc.messageTag === 0xff) {
                message.cancel();
                const componentNetId = message.netid;
                const modNetId = reactorRpc.modNetId;

                const component = sender.room?.netobjects.get(componentNetId);
                const senderMod = sender.getModByNetId(modNetId);

                if (!component) {
                    this.logger.warn("Got reactor rpc from %s for unknown component with netid %s",
                        sender, componentNetId);
                    return;
                }

                if (!senderMod) {
                    this.logger.warn("Got reactor rpc from %s for unknown mod with netid %s",
                        sender, modNetId);
                    return;
                }

                if (senderMod.networkSide === ModPluginSide.Clientside) {
                    this.logger.warn("Got reactor rpc from %s for client-side-only reactor mod %s",
                        sender, senderMod);

                    if (this.config.reactor && (this.config.reactor === true || this.config.reactor.blockClientSideOnly)) {
                        return;
                    }
                }

                const rpcHandlers = this.pluginLoader.reactorRpcHandlers.get(`${senderMod.modId}:${reactorRpc.customRpc.messageTag}`);
                if (rpcHandlers) {
                    for (const handler of rpcHandlers) {
                        handler(component, reactorRpc.customRpc);
                    }
                }

                if (typeof this.config.reactor !== "boolean") {
                    const modConfig = this.config.reactor.mods[senderMod.modId];
                    if (typeof modConfig === "object") {
                        if (modConfig.doNetworking === false) { // doNetworking can be undefined and is defaulted to true
                            return false;
                        }
                    }
                }

                for (const [ , receiveClient ] of sender.room!.connections) {
                    if (receiveClient === sender)
                        continue;

                    const receiverMods = receiveClient.mods.get(senderMod.modId);

                    if (!receiverMods)
                        continue;

                    sender.room!.broadcastMessages([
                        new RpcMessage(
                            message.netid,
                            new ReactorRpcMessage(
                                receiverMods.netId,
                                reactorRpc.customRpc
                            )
                        )
                    ], undefined, [ receiveClient ]);
                }
            }
        });

        this.decoder.on(GameDataMessage, async (message, direction, { sender, reliable }) => {
            const player = sender.getPlayer();

            if (!player)
                return;

            const notCanceled = [];
            // 'player' will be a player object in the perspective, see Connection.getPlayer
            const playerPov = player.room instanceof Perspective
                ? player.room
                : undefined;

            for (let i = 0; i < message.children.length; i++) {
                const child = message.children[i];

                if (child.canceled)
                    continue;

                // don't broadcast it if it's unknown
                if (!this.config.socket.broadcastUnknownGamedata && child instanceof UnknownGameDataMessage) {
                    continue;
                }

                // send message to the player's perspective or their room
                if (playerPov) {
                    await playerPov.decoder.emitDecoded(child, direction, sender);
                } else {
                    await sender.room!.decoder.emitDecoded(child, direction, sender);
                }

                if (child.canceled)
                    continue;

                notCanceled.push(child);
            }

            if (playerPov) {
                // match messages against the perspective's outgoing filter and broadcast those messages to the base room (outgoing perspective -> room)
                const povNotCanceled = [];
                for (let i = 0; i < notCanceled.length; i++) {
                    const child = notCanceled[i];

                    (child as any)._canceled = false; // child._canceled is private
                    await playerPov.outgoingFilter.emitDecoded(child, MessageDirection.Serverbound, playerPov);

                    if (child.canceled)
                        continue;

                    povNotCanceled.push(child);
                }

                if (povNotCanceled.length) {
                    // broadcast messages to the room that matched against the outgoing filter
                    await sender.room?.broadcastMessages(povNotCanceled, [], undefined, [sender], reliable);
                    await sender.room?.broadcastToPerspectives(sender, povNotCanceled, reliable);
                }

                if (notCanceled.length) {
                    // broadcast messages to the player's pov that weren't canceled above
                    await playerPov.broadcastMessages(notCanceled, [], undefined, [sender], reliable);
                }
            } else {
                await sender.room?.broadcastToPerspectives(sender, notCanceled, reliable);

                if (notCanceled.length) {
                    // broadcast all messages normally
                    await sender.room?.broadcastMessages(notCanceled, [], undefined, [sender], reliable);
                }
            }
        });

        this.decoder.on(GameDataToMessage, async (message, direction, { sender }) => {
            const player = sender.getPlayer();

            if (!sender.room || !player)
                return;

            if (message.recipientid === SpecialClientId.Server && sender.room.config.serverAsHost) {
                // todo: emit to perspectives too
                for (const child of message._children) {
                    await sender.room.decoder.emitDecoded(child, MessageDirection.Serverbound, player);
                }
            }

            const recipientConnection = sender.room!.connections.get(message.recipientid);

            if (!recipientConnection)
                return;

            const recipientPlayer = recipientConnection.getPlayer();

            if (!recipientPlayer)
                return;

            await player.room.broadcast(message._children, true, recipientPlayer, []);
        });

        this.decoder.on(AlterGameMessage, async (message, direction, { sender }) => {
            const player = sender.getPlayer();
            if (!player)
                return;

            if (!player.isHost) {
                // todo: proper anti-cheat config
                return sender.disconnect(DisconnectReason.Hacking);
            }

            sender.room?.decoder.emitDecoded(message, direction, player);
            await sender.room?.broadcast([], true, undefined, [
                new AlterGameMessage(sender.room.code, message.alterTag, message.value)
            ]);
        });

        this.decoder.on(StartGameMessage, async (message, direction, { sender }) => {
            const player = sender.getPlayer();
            if (!player)
                return;

            if (!player.isHost) {
                // todo: proper anti-cheat config
                return sender.disconnect(DisconnectReason.Hacking);
            }

            sender.room?.decoder.emitDecoded(message, direction, player);
        });

        this.decoder.on(EndGameMessage, async (message, direction, { sender }) => {
            const player = sender.getPlayer();
            if (!player)
                return;

            if (!player.isHost) {
                // todo: proper anti-cheat config
                return sender.disconnect(DisconnectReason.Hacking);
            }

            sender.room?.decoder.emitDecoded(message, direction, player);
        });

        this.decoder.on(KickPlayerMessage, async (message, direction, { sender }) => {
            const player = sender.getPlayer();
            if (!player || !sender.room)
                return;

            if (!player.isHost) {
                // todo: proper anti-cheat config
                return sender.disconnect(DisconnectReason.Hacking);
            }

            const targetConnection = sender.room.connections.get(message.clientid);

            if (!targetConnection)
                return;

            if (message.banned) {
                sender.room.bannedAddresses.add(targetConnection.remoteInfo.address);
            }

            await targetConnection.disconnect(message.banned ? DisconnectReason.Banned : DisconnectReason.Kicked);
        });

        this.decoder.on(GetGameListMessage, async (message, direction, { sender }) => {
            const returnList: GameListing[] = [];
            for (const [ gameCode, room ] of this.rooms) {
                if (gameCode === 0x20 /* local game */) {
                    continue;
                }

                const roomHost = room.host ? room.connections.get(room.host.clientId) : undefined;

                const roomAge = Math.floor((Date.now() - room.createdAt) / 1000);

                if (
                    room.settings.keywords === message.options.keywords &&
                    (message.options.map & (1 << room.settings.map)) !== 0 &&
                    (
                        room.settings.numImpostors === message.options.numImpostors ||
                        message.options.numImpostors === 0
                    )
                ) {
                    const gameListing = new GameListing(
                        room.code,
                        this.config.socket.ip || "127.0.0.1",
                        this.config.socket.port,
                        roomHost?.username || room.roomName,
                        room.players.size,
                        roomAge,
                        room.settings.map,
                        room.settings.numImpostors,
                        room.settings.maxPlayers
                    );

                    returnList.push(gameListing);

                    if (returnList.length >= 10)
                        break;
                }
            }

            if (returnList.length) {
                await sender.sendPacket(
                    new ReliablePacket(
                        sender.getNextNonce(),
                        [
                            new GetGameListMessage(returnList)
                        ]
                    )
                );
            }
        });
    }

    doPings() {
        for (const [ , connection ] of this.connections) {
            if (connection.sentPackets.length === 8 && connection.sentPackets.every(packet => !packet.acked)) {
                this.logger.warn("%s failed to acknowledge any of the last 8 reliable packets sent, presumed dead",
                    connection);

                connection.disconnect();
                continue;
            }

            connection.sendPacket(
                new PingPacket(
                    connection.getNextNonce()
                )
            );
            for (let i = 0; i < connection.sentPackets.length; i++) {
                const sent = connection.sentPackets[i];
                if (!sent.acked) {
                    if (Date.now() - sent.sentAt > 1500) {
                        this._sendPacket(connection.remoteInfo, sent.buffer);
                        sent.sentAt = Date.now();
                    }
                }
            }
        }
    }

    updateConfig(newConfig: Partial<HindenburgConfig>) {
        if (newConfig.socket && newConfig.socket?.port !== this.config.socket.port) {
            this.socket.close();
            this.socket = dgram.createSocket("udp4");
            this.listen(newConfig.socket.port);
        }

        if (newConfig.plugins) {
            const pluginKeys = Object.keys(newConfig.plugins);
            for (let i = 0; i < pluginKeys.length; i++) {
                const key = pluginKeys[i];
                const loadedPlugin = this.pluginLoader.loadedPlugins.get(key);

                if (!newConfig.plugins[key]) {
                    this.pluginLoader.unloadPlugin(key);
                } else {
                    if (!loadedPlugin) {
                        this.pluginLoader.resolveImportPath(key);
                        continue;
                    }

                    if (!recursiveCompare(newConfig.plugins[key], this.config.plugins[key])) {
                        const setConfig = newConfig.plugins[loadedPlugin.meta.id];
                        const pluginConfig = recursiveClone(loadedPlugin.meta.defaultConfig);
                        if (setConfig && setConfig !== true) {
                            recursiveAssign(pluginConfig, setConfig);
                        }
                        loadedPlugin.setConfig(pluginConfig);
                    }
                }
            }
        }

        this.validVersions = this.config.versions.map(version => VersionInfo.from(version).encode());
        recursiveAssign(this.config, newConfig, { removeKeys: true });
    }

    checkClientMods(connection: Connection) {
        if (!connection.usingReactor)
            return true;

        if (connection.mods.size < connection.numMods) {
            connection.disconnect(i18n.havent_received_all_mods);
            return false;
        }

        if (!this.config.reactor) {
            connection.disconnect(i18n.reactor_not_enabled_on_server);
            return false;
        }

        if (this.config.reactor === true)
            return true;

        const configEntries = Object.entries(this.config.reactor.mods);
        for (const [ modId, modConfig ] of configEntries) {
            const clientMod = connection.mods.get(modId);

            if (!clientMod) {
                if (modConfig === false) {
                    return;
                }

                if (modConfig === true || !modConfig.optional) {
                    connection.disconnect(i18n.missing_required_mod,
                        modId, modConfig !== true && modConfig.version
                            ? "v" + modConfig.version : "any");
                }

                continue;
            }

            if (modConfig === false) {
                connection.disconnect(i18n.mod_banned_on_server, modId);
                return false;
            }

            if (typeof modConfig === "object") {
                if (modConfig.banned) {
                    connection.disconnect(i18n.mod_banned_on_server, modId);
                    return false;
                }

                if (modConfig.version) {
                    if (!minimatch(clientMod.modVersion, modConfig.version)) {
                        connection.disconnect(i18n.bad_mod_version,
                            modId, "v" + clientMod.modVersion, "v" + modConfig.version);
                        return false;
                    }
                }
            }
        }

        if (!this.config.reactor.allowExtraMods) {
            for (const [ , clientMod ] of connection.mods) {
                const modConfig = this.config.reactor.mods[clientMod.modId];

                if (!modConfig) {
                    connection.disconnect(i18n.mod_not_recognised,
                        clientMod.modId);
                    return false;
                }
            }
        }

        return true;
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

        const start = Date.now();
        const writer = HazelWriter.alloc(1024);
        writer.uint8(packet.messageTag);
        writer.write(packet, MessageDirection.Clientbound, this.decoder);
        writer.realloc(writer.cursor);

        const tookMs = Date.now() - start;
        if (tookMs > 5) {
            this.logger.warn("Took %sms to write: %s (%s bytes) to %s", tookMs, packet.messageTag, writer.buffer.byteLength, connection);
        }

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
            await this._sendPacket(connection.remoteInfo, writer.buffer);
        } else {
            await this._sendPacket(connection.remoteInfo, writer.buffer);
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

            if (!parsedPacket) {
                const connection = this.getOrCreateConnection(rinfo);
                this.logger.warn("%s sent an unknown root packet (%s)", connection, buffer[0]);
                return;
            }

            const parsedReliable = parsedPacket as ReliableSerializable;

            const cachedConnection = this.connections.get(rinfo.address + ":" + rinfo.port);

            try {
                if (cachedConnection) {
                    const isReliable = parsedReliable.nonce !== undefined && parsedPacket.messageTag !== SendOption.Acknowledge;
                    if (isReliable) {
                        cachedConnection.receivedPackets.unshift(parsedReliable.nonce);
                        cachedConnection.receivedPackets.splice(8);

                        await cachedConnection.sendPacket(
                            new AcknowledgePacket(
                                parsedReliable.nonce,
                                []
                            )
                        );

                        if (parsedReliable.nonce < cachedConnection.nextExpectedNonce - 1) {
                            this.logger.warn("%s is behind (got %s, last nonce was %s)",
                                cachedConnection, parsedReliable.nonce, cachedConnection.nextExpectedNonce - 1);
                            return;
                        }

                        if (parsedReliable.nonce !== cachedConnection.nextExpectedNonce && this.config.socket.messageOrdering) {
                            this.logger.warn("%s holding packet with nonce %s, expected %s",
                                cachedConnection, parsedReliable.nonce, cachedConnection.nextExpectedNonce);

                            if (!cachedConnection.unorderedMessageMap.has(parsedReliable.nonce)) {
                                cachedConnection.unorderedMessageMap.set(parsedReliable.nonce, parsedReliable);
                            }

                            return;
                        }

                        cachedConnection.nextExpectedNonce++;
                    }

                    await this.decoder.emitDecoded(parsedPacket, MessageDirection.Serverbound, {
                        sender: cachedConnection,
                        reliable: isReliable
                    });

                    if (isReliable && this.config.socket.messageOrdering) {
                        // eslint-disable-next-line no-constant-condition
                        while (true) {
                            const nextMessage = cachedConnection.unorderedMessageMap.get(cachedConnection.nextExpectedNonce);
                            if (!nextMessage)
                                break;

                            await this.decoder.emitDecoded(nextMessage, MessageDirection.Serverbound, {
                                sender: cachedConnection,
                                reliable: isReliable
                            });

                            cachedConnection.unorderedMessageMap.delete(cachedConnection.nextExpectedNonce);
                            cachedConnection.nextExpectedNonce++;
                        }
                    }
                } else {
                    if (parsedReliable.messageTag !== SendOption.Hello)
                        return;

                    const connection = cachedConnection || new Connection(this, rinfo, this.getNextClientId());
                    if (!cachedConnection)
                        this.connections.set(rinfo.address + ":" + rinfo.port, connection);

                    connection.nextExpectedNonce = parsedReliable.nonce + 1;

                    await this.decoder.emitDecoded(parsedPacket, MessageDirection.Serverbound, {
                        sender: connection,
                        reliable: true
                    });
                }
            } catch (e) {
                const connection = this.getOrCreateConnection(rinfo);
                this.logger.error("Error occurred while processing packet from %s:",
                    connection);
                console.log(e);
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

        let roomCode = len === 4 ? V1Gen() : V2Gen();
        while (this.rooms.get(roomCode))
            roomCode = len === 4 ? V1Gen() : V2Gen();

        return roomCode;
    }

    /**
     * Create a room on this server.
     * @param code The game code for the room, see {@link Worker.generateRoomCode}
     * to generate one.
     * @param options Game options for the room.
     * @returns The created room.
     */
    async createRoom(code: number, options: GameSettings) {
        if (this.rooms.has(code))
            throw new Error("A room with code '" + Int2Code(code) + "' already exists.");

        const copyConfiguration: RoomsConfig = {
            ...this.config.rooms
        };

        const createdRoom = new Room(this, copyConfiguration, options);
        await createdRoom.setCode(code);
        this.rooms.set(code, createdRoom);

        createdRoom.emit(
            new RoomCreateEvent(createdRoom)
        );

        return createdRoom;
    }

    async attemptJoin(connection: Connection, code: number) {
        const foundRoom = this.rooms.get(code);

        const ev = await this.emit(
            new WorkerBeforeJoinEvent(
                connection,
                code,
                foundRoom
            )
        );

        if (ev.canceled)
            return;

        if (!ev.alteredRoom) {
            this.logger.info("%s attempted to join %s but there was no room with that code",
                connection, fmtCode(code));

            return connection.joinError(DisconnectReason.GameNotFound);
        }

        if (ev.alteredRoom.bannedAddresses.has(connection.remoteInfo.address)) {
            this.logger.warn("%s attempted to join %s but they were banned",
                connection, foundRoom);
            return connection.disconnect(DisconnectReason.Banned);
        }

        if (ev.alteredRoom.connections.size >= ev.alteredRoom.settings.maxPlayers) {
            this.logger.warn("%s attempted to join %s but it was full",
                connection, foundRoom);
            return connection.joinError(DisconnectReason.GameFull);
        }

        if (ev.alteredRoom.state === GameState.Started) {
            this.logger.warn("%s attempted to join %s but the game had already started",
                connection, foundRoom);
            return connection.joinError(DisconnectReason.GameStarted);
        }

        if (this.config.reactor !== false && (
            this.config.reactor === true ||
            this.config.reactor.requireHostMods
        ) && ev.alteredRoom.hostId) {
            const hostConnection = ev.alteredRoom.connections.get(ev.alteredRoom.hostId);
            if (hostConnection) {
                if (hostConnection.usingReactor && !connection.usingReactor) {
                    return connection.joinError(i18n.reactor_required_for_room);
                }

                if (!hostConnection.usingReactor && connection.usingReactor) {
                    return connection.joinError(i18n.reactor_not_enabled_for_room);
                }

                for (const [ hostModId, hostMod ] of hostConnection.mods) {
                    if (
                        hostMod.networkSide === ModPluginSide.Clientside &&
                        (
                            this.config.reactor === true ||
                            this.config.reactor.blockClientSideOnly
                        )
                    )
                        continue;

                    const clientMod = connection.mods.get(hostModId);

                    if (!clientMod) {
                        return connection.joinError(i18n.missing_required_mod,
                            hostMod.modId, hostMod.modVersion);
                    }

                    if (clientMod.modVersion !== hostMod.modVersion) {
                        return connection.joinError(i18n.bad_mod_version,
                            clientMod.modId, clientMod.modVersion, hostMod.modVersion);
                    }
                }

                for (const [ clientModId, clientMod ] of connection.mods) {
                    if (
                        clientMod.networkSide === ModPluginSide.Clientside &&
                        (
                            this.config.reactor === true ||
                            this.config.reactor.blockClientSideOnly
                        )
                    )
                        continue;

                    const hostMod = hostConnection.mods.get(clientModId);

                    if (!hostMod) {
                        return connection.joinError(i18n.mod_not_recognised,
                            clientMod.modId);
                    }
                }
            }
        }

        this.logger.info("%s joining room %s",
            connection, ev.alteredRoom);

        await ev.alteredRoom.handleRemoteJoin(connection);
    }
}
