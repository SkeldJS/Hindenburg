import dgram from "dgram";
import winston from "winston";
import vorpal from "vorpal";
import chalk from "chalk";
import minimatch from "minimatch";

import { DisconnectReason, Language, GameState, GameDataMessageTag } from "@skeldjs/constant";

import {
    AcknowledgePacket,
    AlterGameMessage,
    BaseRootPacket,
    DataMessage,
    DisconnectPacket,
    EndGameMessage,
    GameDataMessage,
    GameDataToMessage,
    GameListing,
    GameOptions,
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
import { fmtCode } from "./util/fmtCode";

import { HindenburgConfig } from "./interfaces/HindenburgConfig";
import { ModdedHelloPacket } from "./packets/ModdedHelloPacket";

import { Connection, ClientMod, SentPacket } from "./Connection";

import { PluginLoader, ChatCommandHandler } from "./handlers";
import { Room, RoomEvents, MessageSide } from "./Room";

import {
    ClientBanEvent,
    ClientConnectEvent,
    WorkerBeforeCreateEvent,
    WorkerBeforeJoinEvent
} from "./api";

import { recursiveAssign } from "./util/recursiveAssign";
import { recursiveCompare } from "./util/recursiveCompare";
import { ReactorRpcMessage } from "./packets";
import { chunkArr } from "./util/chunkArr";

import i18n from "./i18n";

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
    config: HindenburgConfig; // todo: maybe create a config class? could handle things like checking if a version is valid
    validVersions: number[];

    /**
     * Winston logger for this server.
     */
    logger: winston.Logger;
    
    vorpal: vorpal;

    /**
     * The server's plugin loader.
     */
    pluginLoader: PluginLoader;

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
        this.validVersions = this.config.versions.map(version => VersionInfo.from(version).encode());
        
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

        this.pluginLoader = new PluginLoader(this, pluginDir);
        this.chatCommandHandler = new ChatCommandHandler(this);

        this.socket = dgram.createSocket("udp4");
        this.socket.on("message", this.handleMessage.bind(this));

        this.lastClientId = 0;
        this.connections = new Map;
        this.rooms = new Map;

        this.decoder = new PacketDecoder;
        this.pluginLoader.reregisterMessages();

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

            if (!this.validVersions.includes(connection.clientVersion.encode())) {
                this.logger.warn("%s connected with invalid client version: %s",
                    connection, connection.clientVersion.toString());
                connection.disconnect(DisconnectReason.IncorrectVersion);
                return;
            }

            this.logger.info("%s connected, language: %s",
                connection, Language[connection.language] || "Unknown");

            if (connection.usingReactor) {
                if (!this.config.reactor) {
                    connection.disconnect(i18n.reactor_not_enabled_on_server);
                    return;
                }

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
                
                const entries = [...this.pluginLoader.loadedPlugins];
                const chunkedPlugins = chunkArr(entries, 4);
                for (let i = 0; i < chunkedPlugins.length; i++) {
                    const chunk = chunkedPlugins[i];
                    
                    connection.sendPacket(
                        new ReliablePacket(
                            connection.getNextNonce(),
                            chunk.map(([ , plugin ]) => 
                                new ReactorMessage(
                                    new ReactorModDeclarationMessage(
                                        i,
                                        new ReactorMod(
                                            plugin.meta.id,
                                            "1.0.0", // todo: get plugin's package.json
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
                    connection.disconnect(i18n.reactor_required_on_server);
                    return;
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
                message.netId,
                message.mod.modId,
                message.mod.version,
                message.mod.networkSide
            );

            connection.mods.set(clientMod.modId, clientMod);

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
                    break;
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

            if (!this.checkClientMods(connection))
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

            if (ev.alteredRoom.state === GameState.Started) {
                this.logger.warn("%s attempted to join %s but the game had already started",
                    connection, foundRoom);
                return connection.joinError(DisconnectReason.GameStarted);
            }

            if (this.config.reactor !== false && (
                this.config.reactor === true ||
                this.config.reactor.requireHostMods
            ) && ev.alteredRoom.hostid) {
                const hostConnection = ev.alteredRoom.connections.get(ev.alteredRoom.hostid);
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
        });

        this.decoder.on(RpcMessage, async (message, direction, connection) => {
            const player = connection.getPlayer();
            if (!player)
                return;

            const reactorRpc = message.data as unknown as ReactorRpcMessage;
            if (reactorRpc.tag === 0xff) {
                message.cancel();
                const componentNetId = message.netid;
                const modNetId = reactorRpc.modNetId;

                const component = connection.room?.netobjects.get(componentNetId);
                const senderMod = connection.getModByNetId(modNetId);

                if (!component) {
                    this.logger.warn("Got reactor Rpc from %s for unknown component with netid %s",
                        connection, componentNetId);
                    return;
                }

                if (!senderMod) {
                    this.logger.warn("Got reactor Rpc from %s for unknown mod with netid %s",
                        connection, modNetId);
                    return;
                }

                if (senderMod.networkSide === ModPluginSide.Clientside) {
                    this.logger.warn("Got reactor Rpc from %s for client-side-only reactor mod %s",
                        connection, senderMod);

                    if (this.config.reactor && (this.config.reactor === true || this.config.reactor.blockClientSideOnly)) {
                        return;
                    }
                }

                // todo: find better way of doing this because this is very slow (probably some sort of event listener on the plugin loader)
                for (const [ , loadedPlugin ] of this.pluginLoader.loadedPlugins) {
                    for (const [ classname, modId, tag, handlerFn ] of loadedPlugin.reactorRpcHandlers) {
                        if (classname === component.classname && modId === senderMod.modId && tag === reactorRpc.customRpc.tag) {
                            handlerFn(component, reactorRpc.customRpc);
                        }
                    }
                }

                for (const [ , receiveClient ] of connection.room!.connections) {
                    if (receiveClient === connection)
                        continue;

                    const receiverMods = receiveClient.mods.get(senderMod.modId);

                    if (!receiverMods)
                        continue;

                    connection.room!.broadcastMessages([
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

        this.decoder.on(GameDataMessage, async (message, direction, connection) => {
            const player = connection.getPlayer();
            if (!player)
                return;

            const canceled = message.children
                .filter(child => !child.canceled);

            let reliable = false;
            for (const child of canceled) {
                if (child.tag !== GameDataMessageTag.Data) {
                    reliable = true;
                } else {
                    const dataMessage = child as DataMessage;
                    const component = connection.room!.netobjects.get(dataMessage.netid);
                    if (component?.classname !== "CustomNetworkTransform") {
                        reliable = true;
                    }
                }
                await connection.room?.decoder.emitDecoded(child, direction, connection);
            }
            
            await connection.room?.broadcastMessages(
                message.children
                    .filter(child => !child.canceled)
            , [], undefined, [connection], reliable);
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

        this.decoder.on(AlterGameMessage, async (message, direction, connection) => {
            const player = connection.getPlayer();
            if (!player)
                return;

            if (!player.ishost) {
                // todo: proper anti-cheat config
                return connection.disconnect(DisconnectReason.Hacking);
            }

            connection.room?.decoder.emitDecoded(message, direction, player);
            await connection.room?.broadcastMessages([], [
                new AlterGameMessage(connection.room.code, message.alterTag, message.value)
            ]);
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

        this.decoder.on(KickPlayerMessage, async (message, direction, connection) => {
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

        this.decoder.on(GetGameListMessage, async (message, direction, connection) => {
            const returnList: GameListing[] = [];
            for (const [ gameCode, room ] of this.rooms) {
                if (gameCode === 0x20 /* local game */) {
                    continue;
                }

                const roomHost = room.connections.get(room.hostid);

                if (roomHost) {
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
                            "127.0.0.1", /* todo: get ip somehow */
                            this.config.socket.port,
                            roomHost.username,
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
            }

            if (returnList.length) {
                await connection.sendPacket(
                    new ReliablePacket(
                        connection.getNextNonce(),
                        [
                            new GetGameListMessage(returnList)
                        ]
                    )
                );
            }
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
                    this.logger.info("%s plugins(s) loaded", this.pluginLoader.loadedPlugins.size);
                    const loadedPlugins = [...this.pluginLoader.loadedPlugins];
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
                const loadedPlugin = this.pluginLoader.loadedPlugins.get(key);

                if (!config.plugins[key]) {
                    this.pluginLoader.unloadPlugin(key);
                } else {
                    if (!loadedPlugin) {
                        this.pluginLoader.resolveImportPath(key);
                        continue;
                    }

                    if (!recursiveCompare(config.plugins[key], this.config.plugins[key])) {
                        loadedPlugin.setConfig(config.plugins[key]);
                    }
                }
            }
        }

        this.validVersions = this.config.versions.map(version => VersionInfo.from(version).encode());
        recursiveAssign(this.config, config, { removeKeys: true });
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
                            modId, "v" + clientMod.modVersion, "v" + modConfig.version)
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

                                if (buffer[5] !== 0xff) { // reactor sucks and sends the mod declaration message with a nonce of 0 because it sucks
                                    return;
                                }
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