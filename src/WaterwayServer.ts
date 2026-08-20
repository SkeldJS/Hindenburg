import * as dgram from "dgram";
import * as vorpal from "vorpal";
import * as chalk from "chalk";

import {
    DisconnectReason,
    Language,
    GameState,
    GameKeyword,
    TaskBarMode,
    KillDistance,
    GameMap,
    SendOption,
    QuickChatMode,
    Platform,
    GameOverReason,
    RootMessageTag,
    Filters,
    StatefulRoomConfig,
    StatefulRoomEvents
} from "@skeldjs/au-core";

import {
    AcknowledgePacket,
    AlterGameMessage,
    BaseGameDataMessage,
    BaseRootMessage,
    BaseRootPacket,
    DisconnectPacket,
    EndGameMessage,
    GameDataMessage,
    GameDataToMessage,
    GameListing,
    GameSettings,
    C2SGetGameListMessage,
    HelloPacket,
    C2SHostGameMessage,
    C2SJoinGameMessage,
    KickPlayerMessage,
    NormalPacket,
    PingPacket,
    PlatformSpecificData,
    QueryPlatformIdsMessage,
    ReliablePacket,
    StartGameMessage,
    UnknownRootMessage,
    S2CGetGameListMessage,
    S2CHostGameMessage,
    UnreliablePacket,
    DtlsHelloPacket,
    RemoveGameMessage,
    JoinedGameMessage,
    C2SRemovePlayerMessage,
    C2SReportPlayerMessage,
    SetGameSessionMessage,
    RedirectMessage,
    WaitForHostMessage,
    SetActivePodTypeMessage,
    AllGameSettings
} from "@skeldjs/au-protocol";

import { HazelReader, HazelWriter } from "@skeldjs/hazel";
import { EventEmitter, EventMapFromList } from "@skeldjs/events";
import { RoomCode, RoomCodeVersion, Version } from "@skeldjs/au-client";

import { recursiveAssign } from "./util/recursiveAssign";
import { recursiveCompare } from "./util/recursiveCompare";
import { recursiveClone } from "./util/recursiveClone";

import { Connection, SentPacket } from "./Connection";
import { MessageSide, Room, RoomPrivacy } from "./Room";
import { RoomEvents, SpecialClientId } from "./Room";

import {
    ClientBanEvent,
    ClientConnectEvent,
    ClientDisconnectEvent,
    RoomCreateEvent,
    RoomBeforeCreateEvent,
    WorkerBeforeJoinEvent,
    WorkerGetGameListEvent,
    WorkerLoadPluginEvent
} from "./api";

import { LoadedPlugin, PluginLoader, WorkerPlugin } from "./handlers";

import i18n from "./i18n";
import { Matchmaker } from "./Matchmaker";
import { Logger } from "./Logger";
import { PortPoolService } from "./PortPoolService";
import { GameOptionsValidator } from "./game/GameOptions";

const byteSizes = ["bytes", "kb", "mb", "gb", "tb"];
function formatBytes(bytes: number) {
    if (bytes === 0)
        return "0 bytes";

    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return (bytes / Math.pow(1024, i)).toFixed(2) + " " + byteSizes[i];
}

export type ReliableSerializable = BaseRootPacket & { nonce: number };

export type PluginConfig = {
    /**
     * Whether to load all plugins in the plugin directory.
     * @default true
     */
    loadDirectory: boolean;
    [key: string]: boolean | Record<string, unknown>;
}

export type MatchmakerConfig = {
    /**
     * The port that the matchmaker should listen on.
     * @default 22021
     */
    port: number;
}

export type SocketConfig = {
    /**
     * The port to listen on.
     * @default 22023
     */
    port: number;
    /**
     * Any additional ports for Waterway to listen on.
     * @default []
     */
    additionalPorts: number[];
    /**
     * Whether or not to broadcast gamedata messages that don't get handled by the server.
     * @default false
     */
    acceptUnknownGameData: boolean;
    /**
     * Whether to order reliable packets received from clients.
     * @default false
     */
    messageOrdering: boolean;
    /**
     * The IP address of this node, set to `auto` for it to get auto-discovered.
     * @default "auto"
     */
    ip: string;
    /**
     * Whether or not to use the DTLS transport layout when listening for Hello packets.
     * @default false
     */
    useDtlsLayout: boolean;
    /**
     * Range of dynamic per-player UDP ports, `[start, end]` (like Impostor's
     * delta ports). Disabled when null/undefined.
     * @default [22224, 22524]
     */
    deltaPortRange?: [number, number] | null;
}

export type ConnectionsFormatOptions = "id" | "ip" | "ping" | "room" | "level" | "version" | "platform" | "language" | "puid" | "friendcode";
export type RoomFormatOptions = "players" | "map" | "host" | "privacy";
export type PlayerFormatOptions = "id" | "ping" | "level" | "ishost" | "platform" | "language";

export type LoggingConfig = {
    /**
     * Whether to hide sensitive information from logging, such as ip addresses.
     * @default false
     */
    hideSensitiveInfo: boolean;
    /**
     * Whether or not player names in logs should be the same color as their actual player in-game.
     * @default true
     */
    playerColors: boolean;
    /**
     * Logging options for client connections.
     */
    connections: {
        /**
         * Custom formatting for the extra information provided when logging
         * client connections. (The part in parenthesis after their username.)
         *
         * @param id The client's client id.
         * @param ip The client's ip address.
         * @param ping The client's round-trip ping.
         * @param room The client's current room code.
         * @param language The client's language.
         *
         * @example
         * ```json
         * {
         *     // Hide the client's round-trip ping.
         *     "format": ["id", "ip", "room"]
         * }
         *
         * // => weakeyes (140, 127.0.0.1, ABCDEF)
         * ```
         *
         * @default ["id", "ip", "ping", "room"]
         */
        format?: ConnectionsFormatOptions[];
    };
    /**
     * Logging options for game rooms.
     */
    rooms: {
        /**
         * Custom formatting for the extra information provided when rooms are
         * logged. (The part in parenthesis after the game code.)
         *
         * @param players The total number of players currently connected to the room.
         * @param map The map that the room is currently playing.
         * @param host The host player of the room, or the server.
         *
         * @example
         * ```json
         * {
         *     // Don't show any extra information about the room.
         *     "format": []
         * }
         *
         * // => ABCDEF
         * ```
         *
         * @default ["players", "map", "host", "privacy"]
         */
        format?: RoomFormatOptions[]
    };
    /**
     * Logging options for logging players in-game.
     */
    players: {
        /**
         * Custom formatting for the extra information provided when players are
         * logged. (The part in parenthesis after the player's name.)
         *
         * @param id The client ID of the player.
         * @param ping The player's round-trip ping.
         * @param ishost Whether this player is host. (Not displayed if the player is
         * not host.)
         *
         * @example
         * ```json
         * {
         *     // Don't show the player's ping or whether they are the host.
         *     "format": ["id"]
         * }
         *
         * // => weakeyes (104)
         * ```
         *
         * @default ["id", "ping", "ishost"]
         */
        format?: PlayerFormatOptions[]
    };
}

export type ValidSearchTerm = "map" | "chat" | "chatType";

export type FilterTagConfig = {
    /**
     * The internal name/key for this filter tag.
     */
    name: string;
    /**
     * The display name shown to users.
     */
    displayName: string;
    /**
     * Optional icon identifier for the tag.
     */
    icon?: string;
};

export type GameListingConfig = {
    /**
     * Whether to ignore the privacy of a room, and return even private ones.
     * @default false
     */
    ignorePrivacy: boolean;
    /**
     * Whether to ignore filtering for game listings, and just list every game
     * on the server.
     *
     * Or specify which search terms (`"map"`, `"chat"`, `"chatType"`)
     * to ignore by passing an array.
     * @default false
     */
    ignoreSearchTerms: boolean | ValidSearchTerm[];
    removeExtraFilters: boolean | (string & keyof typeof Filters)[];
    /**
     * The maximum number of results to return to a client at once. Set to `0`
     * or `"all"` for this to be infinite
     * @default 10
     */
    maxResults: number | "all";
    /**
     * Whether to only return results that are a perfect match to all of the sort
     * terms. Otherwise, Waterway will sort results by relevance to the search
     * terms.
     * @default false
     */
    requireExactMatches: boolean;
    /**
     * Static filter tags to serve via the /api/filtertags endpoint.
     * These appear as filter buttons in the client UI.
     * @default []
     */
    filterTags: FilterTagConfig[];
}

export type ChatCommandConfig = {
    /**
     * The prefix (or command identifier) for commands.
     * @default '/'
     */
    prefix: string;
    /**
     * Whether or not rooms can use the built-in help command.
     * @default true
     */
    helpCommand: boolean;
}

export type ServerPlayerOptions = {
    /**
     * The name of the player for a message sent by the server in game chat
     * @default "<color=yellow>[Server]</color>"
     */
    name?: string;
    /**
     * The name of the color of the player for a message sent by the server in game chat.
     *
     * Check out the [Official Wiki page for colors](https://among-us.fandom.com/wiki/Colors)
     * for names to use.
     */
    color?: string;
    /**
     * The ID of the hat of the player for a message sent by the server in game chat.
     *
     * Check out the [Official Wiki page for hats](https://among-us.fandom.com/wiki/Hats)
     * for IDs to use.
     */
    hat?: string;
    /**
     * The ID of the skin of the player for a message sent by the server in game chat.
     *
     * Check out the [Official Wiki page for skins](https://among-us.fandom.com/wiki/Skins)
     * for IDs to use.
     */
    skin?: string;
    /**
     * The ID of the visor of the player for a message sent by the server in game chat.
     *
     * Check out the [Official Wiki page for visors](https://among-us.fandom.com/wiki/Visors)
     * for IDs to use.
     */
    visor?: string;
}

export type AdvancedRoomOptions = {
    /**
     * In-game object types for Waterway to ignore and treat as unknown
     * objects.
     *
     * Pass `false` to ignore no object types and ban uknown object types,
     * or 'true' for Waterway to ignore any unknown objects.
     *
     * Pass `all` to ignore _every_ object type and treat all of them as uknown,
     * including standard Among Us objects.
     *
     * Alternatively, pass an array of either spawn type ids or members of the
     * {@link SpawnType} enum of the objects to ignore and treat as unknown.
     *
     * This will allow objects with a spawn type unknown to Waterway to spawn,
     * making it useful for custom modded maps or mods that use custom objects that
     * aren't implemented on the server. Note that any of these objects spawned
     * can't be handled by Waterway, so they will be incompatible with
     * {@link RoomsConfig.authoritativeServer}.
     * @default false
     */
    unknownObjects: "all" | boolean | (string | number)[];
}

export type RoomsConfig = StatefulRoomConfig & {
    /**
     * Whether or not to make sure players have the same chat mode as the host
     * before joining.
     * @default false
     */
    checkChatMode: boolean;
    /**
     * Whether to allow players to use chat commands.
     * @default true
     */
    chatCommands: boolean | ChatCommandConfig;
    /**
     * The type of game code to generate for rooms, "v1" for a 4-letter code and
     * "v2" for a 6-letter code.
     * @default "v2"
     */
    gameCodes: "v1" | "v2";
    /**
     * Enforce certain settings, preventing the host from changing them.
     * These settings are applied on room creation and cannot be overridden.
     */
    enforceSettings: Partial<AllGameSettings>;
    /**
     * Allowed game modes for rooms on this server. An empty array means all
     * game modes are allowed.
     * @default []
     */
    allowedGameModes: number[];
    /**
     * The default game mode for new rooms.
     * @default 1 (Normal)
     */
    defaultGameMode: number;
    /**
     * Options regarding room plugins.
     */
    plugins: PluginConfig;
    /**
     * Whether the server should act as the host of the room. (experimental)
     * @default false
     */
    authoritativeServer: boolean;
    /**
     * Default appearance for a message sent by the server in game chat
     */
    serverPlayer: ServerPlayerOptions;
    /**
     * The timeout in seconds to wait for a player joins before considering the
     * room empty and destroying it.
     * @default 10
     */
    createTimeout: number;
    /**
     * Advanced room options for mod and plugin developers, or knowledgeable
     * server owners.
     */
    advanced: AdvancedRoomOptions;
}

export type MovementOptimizations = {
    /**
     * Whether or not to re-use the buffer to send to every client, instead of
     * re-constructing the packet each time.
     * @default true
     */
    reuseBuffer: boolean;
    /**
     * How often to actually broadcast movement packets from a single player,
     * should be a very low number, between 1 and 3, where 1 is the most frequent
     * (every packet is broadcasted) and 3 is the least frequent.
     * @default 1
     */
    updateRate: number;
    /**
     * Whether or not to check whether or not the player receiving each movement
     * packet is in the vision of the player that moved, so-as to only send movement
     * packets to those who can see it.
     * @default false
     */
    visionChecks: boolean;
    /**
     * Whether or not to check whether the sender and the reciever are dead so as to not
     * send movement packets from alive players to dead players.
     * @default true
     */
    deadChecks: boolean;
}

export type OptimizationsConfig = {
    /**
     * Options regarding movement packets, since they are the most frequent and
     * most likely to put a lot of strain on the server.
     */
    movement: MovementOptimizations;
    /**
     * Whether or not to completely disable the perspective API for Waterway.
     * @default false
     */
    disablePerspectives: boolean;
}

export type WaterwayConfig = {
    /**
     * Relative or absolute path to other Waterway config(s) to base this one off, to extend all values from.
     */
    extends?: string | string[];
    /**
     * The name of the cluster that this node belongs to.
     * @default "Capybara"
     */
    clusterName: string;
    /**
     * The ID of this node in relation to other nodes in the cluster.
     * @default 0
     */
    nodeId: number;
    /**
     * Whether or not to check for updates.
     * @default true
     */
    checkForUpdates: boolean;
    /**
     * Whether or not to auto-update Waterway when there is an update available.
     * @default false
     */
    autoUpdate: boolean;
    /**
     * Whether or not to confirm when pressing CTRL+C to close Waterway.
     * @default true
     */
    exitConfirmation: boolean;
    /**
     * Default language to localise disconnect messages to.
     * @default "en"
     */
    defaultLanguage: string;
    /**
     * Accepted game versions that clients can connect with.
     */
    acceptedVersions: string[];
    /**
     * Configuration for the included Waterway http matchmaker.
     */
    matchmaker: boolean | MatchmakerConfig;
    /**
     * Options regarding the socket that the server listens on.
     */
    socket: SocketConfig;
    /**
     * Options regarding fine-tuning the results of game listings.
     */
    gameListing: GameListingConfig;
    /**
     * Options regarding plugins, such as disabling them or passing configuration
     * options.
     */
    plugins: PluginConfig;
    /**
     * Options for logging.
     */
    logging: LoggingConfig;
    /**
     * Configuration for rooms, such as enabling/disabling features
     */
    rooms: RoomsConfig;
    /**
     * Options regarding different optimisations that Waterway can use to perform
     * better in high-load scenarios.
     */
    optimizations: OptimizationsConfig
}

export type WaterwayServerEvents = StatefulRoomEvents<Room> &
    RoomEvents &
    EventMapFromList<[
        ClientBanEvent,
        ClientConnectEvent,
        ClientDisconnectEvent,
        RoomBeforeCreateEvent,
        WorkerBeforeJoinEvent,
        WorkerGetGameListEvent,
        WorkerLoadPluginEvent
    ]>;

export class WaterwayServer extends EventEmitter<WaterwayServerEvents> {
    static serverVersion = "3.0.3";

    /**
     * Logger for this server.
     */
    logger: Logger;

    /**
     * Vorpal instance responsible for handling interactive CLI.
     */
    vorpal: vorpal;

    /**
     * The server's plugin loader.
     */
    pluginLoader: PluginLoader;

    loadedPlugins: Map<string, LoadedPlugin<typeof WorkerPlugin>>;

    /**
     * A map of ports to UDP sockets that clients can connect to.
     */
    listenSockets: Map<number, dgram.Socket>;

    /**
     * The Http matchmaker for the server, if enabled, see {@link WaterwayConfig.matchmaker}.
     */
    matchmaker: Matchmaker|undefined;

    /**
     * All client connections connected to this server, mapped by their address:port,
     * see {@link Connection.address}.
     */
    connections: Map<string, Connection>;

    /**
     * Dynamic per-player UDP sockets keyed by delta port, see {@link WaterwayServer.startDeltaListener}.
     */
    deltaListeners: Map<number, dgram.Socket>;

    /**
     * Port pool for dynamic per-player ports, see {@link PortPoolService}.
     */
    portPool: PortPoolService|undefined;

    /**
     * All rooms created on this server, mapped by their game code as an integer.
     *
     * See {@link WaterwayServer.createRoom}
     */
    rooms: Map<number, Room>;

    /**
     * The last client ID that was used.
     *
     * Used for {@link WaterwayServer.getNextClientId} to get an incrementing client
     * ID.
     */
    lastClientId: number;

    pingInterval: NodeJS.Timeout;

    protected acceptedVersions: number[];

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
         * The global configuration for Waterway.
         */
        public config: WaterwayConfig,
        pluginDirectories: string[]
    ) {
        super();

        this.vorpal = new vorpal;

        if (!this.config.exitConfirmation)
            this.vorpal.sigint(process.exit);

        this.logger = new Logger(
            chalk.cyan("W") + chalk.blueBright("a")
            + chalk.blueBright("t") + chalk.blueBright("e")
            + chalk.blueBright("r") + chalk.cyan("w")
            + chalk.cyan("a") + chalk.cyan("y")
        , this.vorpal);

        this.pluginLoader = new PluginLoader(this, pluginDirectories);
        this.loadedPlugins = new Map;

        this.listenSockets = new Map;
        this.deltaListeners = new Map;

        const deltaRange = this.config.socket.deltaPortRange;
        if (deltaRange && deltaRange[0] > 0 && deltaRange[1] >= deltaRange[0]) {
            // Short lease so delta ports allocated but never connected to (e.g. a
            // client that connects via the shared socket instead) recycle quickly
            // and don't exhaust the pool.
            this.portPool = new PortPoolService(deltaRange[0], deltaRange[1], this.config.socket.port, 60 * 1000);
            this.portPool.onLeaseExpired = port => {
                this.returnDeltaPort(port);
            };
            this.logger.info("Dynamic delta ports enabled: %s-%s (clients connect to their assigned port)", deltaRange[0], deltaRange[1]);
        } else {
            this.logger.info("Dynamic delta ports disabled — using shared socket (%s) with username auth", this.config.socket.port);
        }

        if (this.config.matchmaker)
            this.matchmaker = new Matchmaker(this);

        this.lastClientId = 0;
        this.connections = new Map;
        this.rooms = new Map;

        this.acceptedVersions = config.acceptedVersions.map(x => Version.fromString(x).toEncoded());

        this.vorpal.delimiter(chalk.greenBright("waterway~$")).show();
        this.vorpal
            .command("dc [all]", "Forcefully disconnect a client or several clients.")
            .option("--clientid, -i <clientid>", "client id(s) of the client(s) to disconnect")
            .option("--username, -u <username>", "username of the client(s) to disconnect")
            .option("--address, -a <ip address>", "ip address of the client(s) to disconnect")
            .option("--room, -c <room code>", "room code of the client(s) to disconnect")
            .option("--reason, -r <reason>", "reason for why to disconnect the client, see https://waterway.js.org/enums/DisconnectReason.html")
            .option("--ban, -b [duration]", "ban this client, duration in seconds")
            .action(async args => {
                if (typeof args === "string") return;
                const reason = (!isNaN(parseInt(args.options.reason))
                    ? args.options.reason
                    : DisconnectReason[args.options.reason]) || DisconnectReason.Error;

                const roomName = args["room code"]?.toUpperCase();
                const gameId: number = roomName && (roomName === "LOCAL"
                    ? 0x20
                    : RoomCode.fromString(roomName).id);

                let num_disconnected = 0;

                for (const [, connection] of this.connections) {
                    if (
                        args["all"] ||
                        (Array.isArray(args.options.clientid)
                            ? args.options.clientid.includes(connection.clientId)
                            : connection.clientId === args.options.clientid
                        ) ||
                        connection.username === args.options.username ||
                        connection.remoteInfo.address === args.options.address ||
                        connection.room?.code.id === gameId
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
            .option("--reason, -r <reason>", "reason to destroy this room, see https://waterway.js.org/enums/DisconnectReason.html")
            .autocomplete({
                data: async () => {
                    return [...this.rooms.values()].map(room => room.code.toString());
                }
            })
            .action(async args => {
                if (typeof args === "string") return;
                const roomName = args["room code"].toUpperCase();

                const reason = (!isNaN(parseInt(args.options.reason))
                    ? args.options.reason
                    : DisconnectReason[args.options.reason]) || DisconnectReason.ServerRequest;

                const codeId: number = roomName === "LOCAL"
                    ? 0x20
                    : RoomCode.fromString(roomName).id;

                const room = this.rooms.get(codeId);

                if (room) {
                    await room.destroy(reason as unknown as number);
                } else {
                    this.logger.error("Couldn't find room: %s", roomName);
                }
            });

        this.vorpal
            .command("start <room code>", "Start a currently playing match.")
            .autocomplete({
                data: async () => {
                    return [...this.rooms.values()].map(room => room.code.toString());
                }
            })
            .action(async args => {
                if (typeof args === "string") return;
                const roomName = args["room code"].toUpperCase();

                const codeId: number = roomName === "LOCAL"
                    ? 0x20
                    : RoomCode.fromString(roomName).id;

                const room = this.rooms.get(codeId);

                if (room) {
                    if (room.gameState === GameState.Started) {
                        this.logger.error("Game already started: %s", room);
                        return;
                    }

                    await room.startGame();
                } else {
                    this.logger.error("Couldn't find room: %s", roomName);
                }
            });

        this.vorpal
            .command("end <room code>", "End a currently playing match.")
            .option("--reason, -r <reason>", "reason to end the match, see https://waterway.js.org/enums/GameOverReason.html")
            .autocomplete({
                data: async () => {
                    return [...this.rooms.values()].map(room => room.code.toString());
                }
            })
            .action(async args => {
                if (typeof args === "string") return;
                const roomName = args["room code"].toUpperCase();

                const reasonNumber = parseInt(args.options.reason);
                const reason: GameOverReason = !isNaN(reasonNumber)
                    ? reasonNumber
                    : (args.options.reason ? GameOverReason[args.options.reason as keyof typeof GameOverReason] : 255 as GameOverReason);

                const codeId: number = roomName === "LOCAL"
                    ? 0x20
                    : RoomCode.fromString(roomName).id;

                const room = this.rooms.get(codeId);

                if (room) {
                    if (room.gameState === GameState.NotStarted) {
                        this.logger.error("Game not started: %s", room);
                        return;
                    }

                    await room.handleEndGame(reason);
                } else {
                    this.logger.error("Couldn't find room: %s", roomName);
                }
            });

        this.vorpal
            .command("list clients", "List all clients connected to server.")
            .alias("lsc")
            .action(async () => {
                this.logger.info("%s client(s)", this.connections.size);
                const connections = [...this.connections];
                for (let i = 0; i < connections.length; i++) {
                    const [, connection] = connections[i];
                    this.logger.info("%s) %s", i + 1, connection);
                }
            });

        this.vorpal
            .command("list rooms", "List all rooms in the server.")
            .alias("lsr")
            .action(async () => {
                this.logger.info("%s room(s)", this.rooms.size);
                const rooms = [...this.rooms];
                for (let i = 0; i < rooms.length; i++) {
                    const [, room] = rooms[i];
                    this.logger.info("%s) %s", i + 1, room);
                }
            });

        this.vorpal
            .command("list plugins [room code]", "List all plugins loaded into the server or into a room.")
            .alias("lspl")
            .autocomplete({
                data: async () => {
                    return [...this.rooms.values()].map(room => room.code.toString());
                }
            })
            .action(async args => {
                if (typeof args === "string") return;
                const roomName = args["room code"]
                    ? args["room code"].toUpperCase()
                    : "";

                const extendable = roomName
                    ? this.rooms.get(RoomCode.fromString(roomName).id)
                    : this;

                if (!extendable) {
                    this.logger.warn("Couldn't find a room with code: %s", roomName);
                    return;
                }

                if (roomName) {
                    this.logger.info("%s plugins(s) loaded in %s", extendable.loadedPlugins.size, extendable);
                } else {
                    this.logger.info("%s plugins(s) loaded", extendable.loadedPlugins.size);
                }
                const loadedPlugins = [...extendable.loadedPlugins];
                for (let i = 0; i < loadedPlugins.length; i++) {
                    const [, plugin] = loadedPlugins[i];
                    this.logger.info("%s) %s", i + 1, plugin.pluginInstance);
                }
            });

        this.vorpal
            .command("unload <plugin id> [room code]", "Unload a plugin loaded into the server or into a room, pass 'all' into 'plugin id' to unload all plugins.")
            .autocomplete({
                data: async () => {
                    return [...this.loadedPlugins.keys()];
                }
            })
            .action(async args => {
                if (typeof args === "string") return;
                const roomName = args["room code"]
                    ? args["room code"].toUpperCase()
                    : "";

                const extendable = roomName
                    ? this.rooms.get(RoomCode.fromString(roomName).id)
                    : this;

                if (!extendable) {
                    this.logger.warn("Couldn't find a room with code: %s", roomName);
                    return;
                }

                if (args["plugin id"] === "all") {
                    for (const [pluginId] of extendable.loadedPlugins) {
                        if (roomName) {
                            this.pluginLoader.unloadPlugin(pluginId, extendable as Room);
                        } else {
                            this.pluginLoader.unloadPlugin(pluginId);
                        }
                    }
                    return;
                }

                try {
                    if (roomName) {
                        this.pluginLoader.unloadPlugin(args["plugin id"], extendable as Room);
                    } else {
                        this.pluginLoader.unloadPlugin(args["plugin id"]);
                    }
                } catch (e) {
                    if ((e as Error).message.includes("Tried to ")) {
                        this.logger.warn("Plugin with id '%s' not loaded", args["plugin id"]);
                        return;
                    }

                    throw e;
                }
            });

        this.vorpal
            .command("load <plugin id> [room code]", "Load a plugin into the server or into the room, importing if necessary, pass 'all' into 'plugin id' to load all plugins.")
            .option("--hot, -h", "Whether to re-import the plugin if it's already imported")
            .option("--reload, -r", "Whether to reload the plugin if it's already loaded")
            .autocomplete({
                data: async () => {
                    return [...this.pluginLoader.importedPlugins.keys()];
                }
            })
            .action(async args => {
                if (typeof args === "string") return;
                const roomName = args["room code"]
                    ? args["room code"].toUpperCase()
                    : "";

                const extendable = roomName
                    ? this.rooms.get(RoomCode.fromString(roomName).id)
                    : this;

                if (!extendable)
                    return;

                if (extendable.loadedPlugins.has(args["plugin id"]) && !args.options.reload) {
                    this.logger.warn("Not loading plugin, as it is already loaded (pass the --reload or -r flag to load anyway)");
                    return;
                }

                if (roomName) {
                    const room = extendable as Room;

                    if (!room) {
                        this.logger.warn("Couldn't find a room with code: %s", roomName);
                        return;
                    }

                    if (!this.pluginLoader.importedPlugins.has(args["plugin id"]) || args.options.hot) {
                        const didImport = await this.pluginLoader.importFromId(args["plugin id"]);

                        if (!didImport) {
                            this.logger.warn("Couldn't find waterway plugin: %s", args["plugin id"]);
                            return;
                        }
                    }

                    this.pluginLoader.loadPlugin(args["plugin id"], room);
                } else {
                    if (!this.pluginLoader.importedPlugins.has(args["plugin id"]) || args.options.hot) {
                        const didImport = await this.pluginLoader.importFromId(args["plugin id"]);

                        if (!didImport) {
                            this.logger.warn("Couldn't find waterway plugin: %s", args["plugin id"]);
                            return;
                        }
                    }

                    this.pluginLoader.loadPlugin(args["plugin id"]);
                }
            });

        this.vorpal
            .command("sethost <room code> <client id>", "Change the host(s) of a room. If <client id> is 'server', the server will be the central authority.")
            .option("--acting, -a", "Add the host as an acting host or 'fake' host.")
            .option("--remove-acting, -r", "Remove the player as an acting or 'fake' host.")
            .option("--keep-acting, -k", "Whether or not to retain the current acting hosts, if setting a player as the authority. Default false.")
            .alias("sh")
            .autocomplete({
                data: async () => {
                    return [...this.rooms.values()].map(room => room.code.toString());
                }
            })
            .action(async args => {
                if (typeof args === "string") return;
                const roomName = args["room code"].toUpperCase();
                const codeId: number = roomName === "LOCAL"
                    ? 0x20
                    : RoomCode.fromString(roomName).id;

                const room = this.rooms.get(codeId);

                if (!room) {
                    this.logger.error("Couldn't find room: %s", roomName);
                    return;
                }

                if (args["client id"] === "server") {
                    if (room.config.authoritativeServer) {
                        this.logger.error("Room is already server-authoritative");
                        return;
                    }
                    await room.setServerAuthority(true);
                    return;
                }

                const clientId = parseInt(args["client id"]);

                if (isNaN(clientId)) {
                    this.logger.error("Expected a number for the client id: %s", clientId);
                    return;
                }

                const playerConnection = room.connections.get(clientId);

                if (!playerConnection) {
                    this.logger.error("No player in room with client id: %s", clientId);
                    return;
                }

                if (args.options.acting) {
                    if (room.authorityId === playerConnection.clientId) {
                        this.logger.error("%s is already the host", playerConnection);
                        return;
                    }

                    if (room.actingHosts.has(playerConnection)) {
                        this.logger.error("%s is already an acting host", playerConnection);
                        return;
                    }

                    await room.addActingHost(playerConnection);
                } else if (args.options["remove-acting"]) {
                    if (room.authorityId === playerConnection.clientId) {
                        this.logger.error("%s is an actual host", playerConnection);
                        return;
                    }

                    if (!room.actingHosts.has(playerConnection)) {
                        this.logger.error("%s isn't an acting host", playerConnection);
                        return;
                    }
                    await room.removeActingHost(playerConnection);
                } else {
                    const player = room.players.get(clientId);

                    if (!player) {
                        this.logger.error("No player in room with client id: %s", clientId);
                        return;
                    }

                    if (room.authorityId === player.clientId) {
                        this.logger.error("%s is already the host", playerConnection);
                        return;
                    }

                    await room.updatePlayerAuthority(player, !args.options["keep-acting"]);
                }
            });

        this.vorpal
            .command("list players <room code>", "List all players in a room.")
            .alias("lsp")
            .autocomplete({
                data: async () => {
                    return [...this.rooms.values()].map(room => room.code.toString());
                }
            })
            .action(async args => {
                if (typeof args === "string") return;
                const roomName = args["room code"].toUpperCase();
                const codeId: number = roomName === "LOCAL"
                    ? 0x20
                    : RoomCode.fromString(roomName).id;

                const room = this.rooms.get(codeId);

                if (room) {
                    this.logger.info("%s player(s) in %s", room.players.size, room);
                    const players = [...room.players];
                    for (let i = 0; i < players.length; i++) {
                        const [, player] = players[i];
                        this.logger.info("%s) %s", i + 1, player);
                    }
                } else {
                    this.logger.error("Couldn't find room: %s", roomName);
                }
            });

        this.vorpal
            .command("settings <room code>", "Get the current game settings for a room.")
            .autocomplete({
                data: async () => {
                    return [...this.rooms.values()].map(room => room.code.toString());
                }
            })
            .action(async args => {
                if (typeof args === "string") return;
                const roomName = args["room code"].toUpperCase();
                const codeId: number = roomName === "LOCAL"
                    ? 0x20
                    : RoomCode.fromString(roomName).id;

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
                    this.logger.info("- task bar updates: %s", TaskBarMode[room.settings.taskbarUpdates]);
                    // TODO: update for new settings
                } else {
                    this.logger.error("Couldn't find room: %s", roomName);
                }
            });

        this.vorpal
            .command("broadcast <message...>", "Broadcast a message to all rooms, or a specific room.")
            .option("--room, -c <room code>", "the room to send a message to")
            .action(async args => {
                if (typeof args === "string") return;
                const message = args.message.join(" ");
                const roomCode = args.options.room
                    ? RoomCode.fromString(args.options.room.toUpperCase?.()).id
                    : 0;

                const foundRoom = this.rooms.get(roomCode);

                if (foundRoom) {
                    foundRoom.sendChat(message);
                    this.logger.info("Broadcasted message to %s player(s)", foundRoom.connections.size);
                    return;
                } else if (roomCode) {
                    this.logger.error("Couldn't find room: " + args.options.room);
                }

                let numPlayers = 0;
                for (const [, room] of this.rooms) {
                    room.sendChat(message);
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
            this.pollClientReliability();
        }, pingInterval);
    }

    protected _listenPort(port: number) {
        const socket = dgram.createSocket("udp4");
        socket.on("message", this.handleMessage.bind(this, socket));
        socket.on("error", err => {
            this.logger.error("Failed to bind udp port %s: %s (is another server instance already running?)", port, (err as Error).message);
            process.exit(1);
        });

        socket.bind(port);

        this.listenSockets.set(port, socket);
        this.logger.info("Udp server listening on *:" + port);

        return socket;
    }

    protected _unlistenPort(port: number) {
        const socket = this.listenSockets.get(port);

        if (!socket)
            return undefined;

        socket.removeAllListeners("message");
        socket.close();

        this.logger.warn("Stopped listening on *:" + port);

        return socket;
    }

    /**
     * Start a dynamic per-player UDP listener on a delta port. Resolves once the
     * socket is fully bound (so the matchmaker can safely return the port to the
     * client without racing the bind).
     * @param port The delta port to listen on.
     */
    startDeltaListener(port: number): Promise<void> {
        return new Promise((resolve, reject) => {
            if (this.deltaListeners.has(port)) {
                resolve();
                return;
            }

            const socket = dgram.createSocket("udp4");
            socket.on("message", (buffer, rinfo) => {
                this.handleMessage(socket, buffer, rinfo, port);
            });
            socket.on("error", err => {
                this.deltaListeners.delete(port);
                reject(err);
            });
            socket.on("listening", () => {
                this.deltaListeners.set(port, socket);
                this.logger.info("Delta listener listening on *:" + port);
                resolve();
            });
            socket.bind(port);
        });
    }

    /**
     * Stop and fully dispose a delta listener. Resolves once the socket is closed.
     * @param port The delta port to stop listening on.
     */
    stopDeltaListener(port: number): Promise<void> {
        return new Promise(resolve => {
            const socket = this.deltaListeners.get(port);
            if (!socket) {
                resolve();
                return;
            }

            this.deltaListeners.delete(port);
            socket.removeAllListeners("message");
            socket.close(() => resolve());
        });
    }

    /**
     * Return a delta port to the pool. The port is only made available again
     * after the old socket has been fully disposed, which prevents the re-bind
     * race when a freshly returned port is re-allocated while the old socket is
     * still being torn down.
     * @param port The delta port to return.
     */
    async returnDeltaPort(port: number): Promise<void> {
        if (!this.portPool) return;

        this.portPool.returnPort(port);         // mark draining, remove lease
        await this.stopDeltaListener(port);     // fully dispose the socket
        this.portPool.confirmRecycled(port);    // back to available
    }

    /**
     * Bind the socket to the configured port.
     */
    listen() {
        this._listenPort(this.config.socket.port);

        for (const additionalPort of this.config.socket.additionalPorts) {
            this._listenPort(additionalPort);
        }

        this.matchmaker?.listen();
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
    getOrCreateConnection(listenSocket: dgram.Socket, rinfo: dgram.RemoteInfo, deltaPort?: number): Connection {
        const fmt = deltaPort ? "delta:" + deltaPort : rinfo.address + ":" + rinfo.port;
        const cached = this.connections.get(fmt);
        if (cached)
            return cached;

        const clientId = this.getNextClientId();
        const connection = new Connection(this, listenSocket, rinfo, clientId);
        if (deltaPort)
            connection.deltaPort = deltaPort;
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
        const fmt = connection.deltaPort > 0
            ? "delta:" + connection.deltaPort
            : connection.remoteInfo.address + ":" + connection.remoteInfo.port;
        if (this.connections.delete(fmt)) {
            this.logger.info("Remove %s", connection);
            if (connection.deltaPort > 0) {
                // Return the delta port to the pool (fire-and-forget cleanup).
                this.returnDeltaPort(connection.deltaPort);
            }
        }
    }

    isVersionAccepted(version: Version): boolean {
        return this.acceptedVersions.indexOf(version.toEncoded()) !== -1;
    }

    async pollClientReliability() {
        const promises = [];
        const dateNow = Date.now();
        for (const [, connection] of this.connections) {
            if (connection.sentPackets.length === 8 && connection.sentPackets.every(packet => (dateNow - packet.sentAt) > 1500 && !packet.acked)) {
                this.logger.warn("%s failed to acknowledge any of the last 8 reliable packets sent, presumed dead",
                    connection);

                connection.disconnect();
                continue;
            }

            promises.push(connection.sendPacket(
                new PingPacket(
                    connection.getNextNonce()
                )
            ));
            for (let i = 0; i < connection.sentPackets.length; i++) {
                const sent = connection.sentPackets[i];
                if (!sent.acked) {
                    if (dateNow - sent.sentAt > 1500) {
                        this.sendRawPacket(connection.listenSocket, connection.remoteInfo, sent.buffer);
                        sent.sentAt = dateNow;
                    }
                }
            }
        }
        await Promise.all(promises);
    }

    getRoomRelevancy(room: Room, numImpostors: number, lang: number, mapId: number, quickChat: string, perfectMatches: boolean, ignoreSearchTerms: Set<ValidSearchTerm> | false) {
        let relevancy = 0;

        // if (!ignoreSearchTerms || !ignoreSearchTerms.has("impostors")) {
        //     if ((numImpostors === 0 || room.settings.numImpostors === numImpostors)) {
        //         relevancy++;
        //     } else if (perfectMatches) {
        //         return 0;
        //     }
        // }

        if (!ignoreSearchTerms || !ignoreSearchTerms.has("map")) {
            if ((mapId & (1 << room.settings.map)) !== 0) {
                relevancy++;
            } else if (perfectMatches) {
                return 0;
            }
        }

        if (!ignoreSearchTerms || !ignoreSearchTerms.has("chat")) {
            if (room.settings.keywords === (GameKeyword[lang] as unknown as number)) {
                relevancy++;
            } else if (perfectMatches) {
                return 0;
            }
        }

        if (!ignoreSearchTerms || !ignoreSearchTerms.has("chatType")) {
            const roomHost = room.playerAuthority;
            if (roomHost) {
                const hostChatMode = room.getConnection(roomHost)?.chatMode;
                if (hostChatMode !== undefined) {
                    if (hostChatMode === QuickChatMode.QuickChat && quickChat === "QuickChatOnly") {
                        relevancy++;
                    } else if (hostChatMode === QuickChatMode.FreeChat && quickChat === "FreeChatOrQuickChat") {
                        relevancy++;
                    } else if (perfectMatches) {
                        return 0;
                    }
                }
            }
        }

        return relevancy;
    }

    updateConfig(newConfig: WaterwayConfig) {
        const oldPorts = new Set([this.config.socket.port, ...this.config.socket.additionalPorts]);
        const newPorts = new Set([newConfig.socket.port, ...newConfig.socket.additionalPorts]);

        for (const oldPort of oldPorts) {
            if (!newPorts.has(oldPort)) {
                this._unlistenPort(oldPort);
            }
        }

        for (const newPort of newPorts) {
            if (!oldPorts.has(newPort)) {
                this._listenPort(newPort);
            }
        }

        if (newConfig.matchmaker) {
            if (this.matchmaker) {
                // prepare thyself for the worst if statement
                if ((typeof newConfig.matchmaker === "boolean" && (typeof this.config.matchmaker !== "boolean" && this.config.matchmaker.port !== 80)) ||
                    (typeof newConfig.matchmaker === "object" && (typeof this.config.matchmaker === "boolean" ? (newConfig.matchmaker.port !== 80) : (newConfig.matchmaker.port !== this.config.matchmaker.port)))
                ) {
                    this.config.matchmaker = newConfig.matchmaker;
                    this.matchmaker.restart();
                    this.pluginLoader;
                }
            } else {
                this.config.matchmaker = newConfig.matchmaker;
                this.matchmaker = new Matchmaker(this);
                this.matchmaker.listen();
            }
        } else if (!newConfig.matchmaker && this.matchmaker) {
            this.config.matchmaker = newConfig.matchmaker || false;
            this.matchmaker.destroy();
            this.matchmaker = undefined;
        }

        if (newConfig.plugins) {
            const pluginKeys = Object.keys(newConfig.plugins);
            for (let i = 0; i < pluginKeys.length; i++) {
                const key = pluginKeys[i];
                const loadedPlugin = this.loadedPlugins.get(key);

                if (!newConfig.plugins[key]) {
                    if (loadedPlugin) {
                        this.pluginLoader.unloadPlugin(key);
                    }
                } else {
                    if (!loadedPlugin)
                        continue;

                    if (!recursiveCompare(newConfig.plugins[key], this.config.plugins[key])) {
                        const oldConfig = loadedPlugin.pluginInstance.config;

                        const setConfig = newConfig.plugins[loadedPlugin.pluginInstance.meta.id];
                        const pluginConfig = recursiveClone(loadedPlugin.pluginInstance.meta.defaultConfig || {});
                        if (setConfig && setConfig !== true)
                            recursiveAssign(pluginConfig, setConfig);

                        loadedPlugin.pluginInstance.config = pluginConfig;
                        loadedPlugin.pluginInstance.onConfigUpdate(oldConfig, loadedPlugin.pluginInstance.config);
                    }
                }
            }
        }

        recursiveAssign(this.config, newConfig);
    }

    sendRawPacket(listenSocket: dgram.Socket, remote: dgram.RemoteInfo, buffer: Buffer) {
        return new Promise((resolve, reject) => {
            listenSocket.send(buffer, remote.port, remote.address, (err, bytes) => {
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

        const start = Date.now();
        const writer = HazelWriter.alloc(1024);
        writer.uint8(packet.messageTag);
        writer.write(packet);
        writer.realloc(writer.cursor);

        const tookMs = Date.now() - start;
        if (tookMs > 5) {
            this.logger.warn("Took %sms to write: %s (%s bytes) to %s", tookMs, packet.messageTag, writer.nodeBuffer.byteLength, connection);
        }

        if (reliablePacket.nonce !== undefined && !(packet instanceof AcknowledgePacket)) {
            connection.sentPackets.unshift(
                new SentPacket(
                    reliablePacket.nonce,
                    writer.nodeBuffer,
                    Date.now(),
                    false
                )
            );
            connection.sentPackets.splice(8);
            await this.sendRawPacket(connection.listenSocket, connection.remoteInfo, writer.nodeBuffer);
        } else {
            await this.sendRawPacket(connection.listenSocket, connection.remoteInfo, writer.nodeBuffer);
        }
    }

    async handleHello(helloPacket: HelloPacket|DtlsHelloPacket, sender: Connection) {
        if (sender.hasIdentified)
            return;

        sender.receivedPackets.unshift(helloPacket.nonce);
        sender.receivedPackets.splice(8);

        await sender.sendPacket(
            new AcknowledgePacket(
                helloPacket.nonce,
                []
            )
        );

        sender.hasIdentified = true;
        sender.username = helloPacket.username;
        sender.chatMode = helloPacket.chatMode;
        sender.language = helloPacket.language;
        sender.clientVersion = Version.fromEncoded(helloPacket.encodedVersion);
        sender.platform = helloPacket.platform;
        sender.playerLevel = 0;

        // ── Auth matching: delta port (primary) → username (shared-socket fallback) ──
        // Dynamic per-player ports uniquely identify the session. If the client
        // connected to the shared socket instead, we fall back to matching by the
        // session's username (never by IP).
        if (this.matchmaker && this.matchmaker.authCache) {
            const cachedAuth = sender.deltaPort > 0
                ? this.matchmaker.authCache.findByPort(sender.deltaPort)
                : this.matchmaker.authCache.findByUsername(sender.username);
            if (cachedAuth) {
                sender.puid = cachedAuth.puid;
                sender.friendCode = cachedAuth.friendCode;
                sender.isAuthenticated = true;

                if (this.config.logging.hideSensitiveInfo) {
                    this.logger.info("%s authenticated (FriendCode=%s)",
                        sender, cachedAuth.friendCode);
                } else {
                    this.logger.info("%s authenticated (PUID=%s, FriendCode=%s)",
                        sender, cachedAuth.puid, cachedAuth.friendCode);
                }

                if (sender.deltaPort > 0) {
                    // Keep the port-keyed auth alive for the whole session and
                    // confirm the port lease (cancel the timeout).
                    this.portPool?.confirmPort(sender.deltaPort);
                    this.matchmaker.authCache.confirmPort(sender.deltaPort);
                }
            }
        }

        if (!this.isVersionAccepted(sender.clientVersion)) {
            this.logger.warn("%s connected with invalid client version: %s",
                sender, sender.clientVersion.toString());
            sender.disconnect(DisconnectReason.IncorrectVersion);
            return;
        }

        this.logger.info("%s connected, language: %s",
            sender, Language[sender.language] || "Unknown");

        await this.emit(
            new ClientConnectEvent(sender)
        );
    }

    async handleDisconnectPacket(message: DisconnectPacket, sender: Connection) {
        if (!sender.sentDisconnect)
            await sender.disconnect(DisconnectReason.ExitGame);

        this.removeConnection(sender);
    }

    async handleAcknowledgePacket(message: AcknowledgePacket, sender: Connection) {
        for (const sentPacket of sender.sentPackets) {
            if (sentPacket.nonce === message.nonce) {
                sentPacket.acked = true;
                sender.roundTripPing = Date.now() - sentPacket.sentAt;
                break;
            }
        }
    }

    async handleHostGameMessage(message: C2SHostGameMessage, sender: Connection) {
        if (sender.room)
            return;

        const roomCode = this.generateRoomCode(this.config.rooms.gameCodes === "v1" ? 4 : 6);

        const ev = await this.emit(
            new RoomBeforeCreateEvent(
                sender,
                message.gameSettings,
                roomCode
            )
        );

        if (ev.canceled)
            return;

        const validationResult = GameOptionsValidator.validateGameSettingsObject(message.gameSettings);
        if (!validationResult.valid) {
            this.logger.warn("%s created room with invalid game options: %s",
                sender, validationResult.errors.join("; "));
            await sender.disconnect("Invalid game options: " + validationResult.errors.join(", "));
            return;
        }

        const room = await this.createRoom(ev.alteredRoomCode, message.gameSettings, sender);

        this.logger.info("%s created room %s",
            sender, room);

        await sender.sendPacket(
            new ReliablePacket(
                sender.getNextNonce(),
                [
                    new S2CHostGameMessage(ev.alteredRoomCode.id)
                ]
            )
        );
    }

    async handleJoinGameMessage(message: C2SJoinGameMessage, sender: Connection) {
        if (
            sender.room &&
            sender.room.gameState !== GameState.Ended && // extra checks so you can join back the same game after it has ended
            sender.room.code.id !== message.gameId
        )
            return;

        await this.attemptJoin(sender, new RoomCode(message.gameId));
    }

    async handleQueryPlatformIdsMessage(message: QueryPlatformIdsMessage, sender: Connection) {
        const room = this.rooms.get(message.gameCode);
        const playersPlatformSpecificData: PlatformSpecificData[] = [];

        if (room) {
            room.players.forEach(player => {
                playersPlatformSpecificData.push(player.platform);
            });
        }

        await sender.sendPacket(
            new ReliablePacket(
                sender.getNextNonce(),
                [
                    new QueryPlatformIdsMessage(message.gameCode, playersPlatformSpecificData)
                ]
            )
        );
    }

    async handleGameDataMessage(message: GameDataMessage, isReliable: boolean, sender: Connection) {
        const player = sender.getPlayer();

        if (!player) return;

        const notCanceled = await player.room.handleMessagesAndGetNotCanceled(message.children, player);

        if (notCanceled.length > 0)
            await player.room.broadcastMessages(notCanceled, [], undefined, [sender], isReliable);
    }

    async handleGameDataToMessage(message: GameDataToMessage, isReliable: boolean, sender: Connection) {
        const player = sender.getPlayer();

        if (!player) return;

        const connection = player.room.connections.get(message.recipientId);

        if (!connection) {
            if (player.room.authorityId === SpecialClientId.ServerAuthority) {
                await player.room.handleMessagesAndGetNotCanceled(message.children, player);
            } else {
                player.room.logger.warn("Got recipient of game data from %s to a client with id %s who doesn't exist",
                    sender, message.recipientId);
            }
            return;
        }

        await player.room.broadcastMessages(message.children, [], [connection], undefined, isReliable);
    }
    
    async handleAlterGameMesage(message: AlterGameMessage, sender: Connection) {
        const player = sender.getPlayer();
        if (!player) return;

        if (!player.room.canMakeHostChanges(player)) {
            // Lenient for modded servers: warn + ignore instead of kicking a
            // (possibly recently deposed) host, which would break game flow.
            player.room.logger.warn("%s tried to alter the game but is not the host (ignored)", sender);
            return;
        }
        
        await player.room.handleAlterGameMessage(message);
    }

    async handleStartGameMessage(message: StartGameMessage, sender: Connection) {
        const player = sender.getPlayer();
        if (!player) return;

        if (!player.room.canMakeHostChanges(player)) {
            // Lenient for modded servers: warn + ignore instead of kicking a
            // (possibly recently deposed) host, which would break game flow.
            player.room.logger.warn("%s tried to start the game but is not the host (ignored)", sender);
            return;
        }

        await player.room.handleStartGameMessage(message, player);
    }

    async handleEndGameMessage(message: EndGameMessage, sender: Connection) {
        const player = sender.getPlayer();
        if (!player)
            return;

        if (!player.room.canMakeHostChanges(player)) {
            // Lenient for modded servers: warn + ignore instead of kicking a
            // (possibly recently deposed) host, which would break game flow.
            player.room.logger.warn("%s tried to end the game but is not the host (ignored)", sender);
            return;
        }
        
        await player.room.handleEndGameMessage(message);
    }

    async handleKickPlayerMessage(message: KickPlayerMessage, sender: Connection) {
        const player = sender.getPlayer();
        if (!player || !sender.room)
            return;

        if (!player.room.canMakeHostChanges(player)) {
            // Lenient for modded servers: warn + ignore instead of kicking a
            // (possibly recently deposed) host, which would break game flow.
            player.room.logger.warn("%s tried to kick a player but is not the host (ignored)", sender);
            return;
        }

        const targetConnection = sender.room.connections.get(message.clientId);

        if (!targetConnection)
            return;

        if (message.banned) {
            sender.room.bannedAddresses.add(targetConnection.remoteInfo.address);
        }

        await targetConnection.disconnect(message.banned ? DisconnectReason.Banned : DisconnectReason.Kicked);
    }

    async handleRemovePlayerMessage(message: C2SRemovePlayerMessage, sender: Connection) {
        // C2SRemovePlayer is sent by the host client to remove a player from the
        // lobby. Disconnect the target player's connection.
        if (!sender.room) return;

        const targetConn = sender.room.connections.get(message.clientId);
        if (!targetConn) return;

        this.logger.info("%s removed %s from the lobby",
            sender, targetConn);
        await targetConn.disconnect(message.reason);
    }

    async handleGetGameListMessage(message: C2SGetGameListMessage, sender: Connection) {
        const listingIp = sender.remoteInfo.address === "127.0.0.1"
            ? "127.0.0.1"
            : this.config.socket.ip;

        const ignoreSearchTerms = Array.isArray(this.config.gameListing.ignoreSearchTerms)
            ? new Set(this.config.gameListing.ignoreSearchTerms)
            : this.config.gameListing.ignoreSearchTerms;

        const gamesAndRelevance: [number, GameListing][] = [];
        for (const [gameCode, room] of this.rooms) {
            if (gameCode === 0x20 /* local game */) {
                continue;
            }

            if (!this.config.gameListing.ignorePrivacy && room.privacy === RoomPrivacy.Private)
                continue;

            const roomAge = Math.floor((Date.now() - room.createdAt) / 1000);
            // NOTE: The 11-arg GameListing(language) will work once SkeldJS
            // with the Language field lands in node_modules (via Docker COPY or npm publish).
            const gameListing = new (GameListing as any)(
                room.code.id,
                listingIp,
                this.config.socket.port,
                room.roomName,
                room.players.size,
                roomAge,
                room.settings.map,
                room.settings.numImpostors,
                room.settings.maxPlayers,
                room.playerAuthority?.platform || new PlatformSpecificData(
                    Platform.Unknown,
                    "UNKNOWN"
                ),
                room.settings.keywords
            ) as GameListing;

            if (ignoreSearchTerms === true) {
                gamesAndRelevance.push([0, gameListing]);
                continue;
            }

            const relevancy = this.getRoomRelevancy(
                room,
                message.options.numImpostors,
                message.options.keywords,
                message.options.map,
                message.quickchat === QuickChatMode.FreeChat
                    ? "FreeChatOrQuickChat"
                    : "QuickChatOnly",
                this.config.gameListing.requireExactMatches,
                ignoreSearchTerms
            );

            if (relevancy === 0 && this.config.gameListing.requireExactMatches)
                continue;

            gamesAndRelevance.push([
                relevancy,
                gameListing
            ]);
        }

        const sortedResults = gamesAndRelevance.sort((a, b) => {
            if (a[0] === b[0]) {
                return a[1].age - b[1].age;
            }

            return b[0] - a[0];
        });

        const topResults = this.config.gameListing.maxResults === "all"
            || this.config.gameListing.maxResults === 0
            ? sortedResults
            : sortedResults.slice(0, this.config.gameListing.maxResults);

        const results = topResults.map(([, gameListing]) => gameListing);

        const ev = await this.emit(
            new WorkerGetGameListEvent(
                sender,
                message.options.keywords,
                message.options.map,
                message.options.numImpostors,
                results
            )
        );

        if (ev.canceled)
            return;

        if (ev.alteredGames.length) {
            await sender.sendPacket(
                new ReliablePacket(
                    sender.getNextNonce(),
                    [
                        new S2CGetGameListMessage(ev.alteredGames)
                    ]
                )
            );
        }
    }

    parseRootMessage(messageTag: RootMessageTag, reader: HazelReader) {
        switch (messageTag) {
            case RootMessageTag.HostGame: return C2SHostGameMessage.deserializeFromReader(reader);
            case RootMessageTag.JoinGame: return C2SJoinGameMessage.deserializeFromReader(reader);
            case RootMessageTag.StartGame: return StartGameMessage.deserializeFromReader(reader);
            case RootMessageTag.RemoveGame: return RemoveGameMessage.deserializeFromReader(reader);
            case RootMessageTag.RemovePlayer: return C2SRemovePlayerMessage.deserializeFromReader(reader);
            case RootMessageTag.GameData: return GameDataMessage.deserializeFromReader(reader);
            case RootMessageTag.GameDataTo: return GameDataToMessage.deserializeFromReader(reader);
            case RootMessageTag.JoinedGame: return JoinedGameMessage.deserializeFromReader(reader);
            case RootMessageTag.EndGame: return EndGameMessage.deserializeFromReader(reader);
            case RootMessageTag.AlterGame: return AlterGameMessage.deserializeFromReader(reader);
            case RootMessageTag.KickPlayer: return KickPlayerMessage.deserializeFromReader(reader);
            case RootMessageTag.WaitForHost: return WaitForHostMessage.deserializeFromReader(reader);
            case RootMessageTag.Redirect: return RedirectMessage.deserializeFromReader(reader);
            case RootMessageTag.GetGameListV2: return C2SGetGameListMessage.deserializeFromReader(reader);
            case RootMessageTag.ReportPlayer: return C2SReportPlayerMessage.deserializeFromReader(reader);
            case RootMessageTag.SetGameSession: return SetGameSessionMessage.deserializeFromReader(reader);
            case RootMessageTag.SetActivePodType: return SetActivePodTypeMessage.deserializeFromReader(reader);
            case RootMessageTag.QueryPlatformIds: return QueryPlatformIdsMessage.deserializeFromReader(reader);
            case RootMessageTag.GetGameList:
            case RootMessageTag.MasterServerList:
            case RootMessageTag.GetGameListV2:
            case RootMessageTag.QueryLobbyInfo:
            default:
                return undefined;
        }
    }

    async handleRootMessage(message: BaseRootMessage, sender: Connection, isReliable: boolean) {
        if (message instanceof C2SHostGameMessage) return await this.handleHostGameMessage(message, sender);
        if (message instanceof C2SJoinGameMessage) return await this.handleJoinGameMessage(message, sender);
        if (message instanceof QueryPlatformIdsMessage) return await this.handleQueryPlatformIdsMessage(message, sender);
        if (message instanceof GameDataMessage) return await this.handleGameDataMessage(message, isReliable, sender);
        if (message instanceof GameDataToMessage) return await this.handleGameDataToMessage(message, isReliable, sender);
        if (message instanceof AlterGameMessage) return await this.handleAlterGameMesage(message, sender);
        if (message instanceof StartGameMessage) return await this.handleStartGameMessage(message, sender);
        if (message instanceof EndGameMessage) return await this.handleEndGameMessage(message, sender);
        if (message instanceof KickPlayerMessage) return await this.handleKickPlayerMessage(message, sender);
        if (message instanceof C2SGetGameListMessage) return await this.handleGetGameListMessage(message, sender);
        if (message instanceof C2SRemovePlayerMessage) return await this.handleRemovePlayerMessage(message, sender);

        if (message instanceof SetActivePodTypeMessage) {
            // not sure what to do with this..
            return;
        }

        this.logger.error("Unknown root message to handle from client %s, with tag %s",
            sender, RootMessageTag[message.messageTag] || message.messageTag);
    }

    protected async handleRootMessageUnknown(message: BaseGameDataMessage, sender: Connection, isReliable: boolean) {
        if (message instanceof UnknownRootMessage) {
            const parsedMessage = this.parseRootMessage(message.messageTag, message.dataReader);
            return await this.handleRootMessage(parsedMessage || message, sender, isReliable);
        }
        return await this.handleRootMessage(message, sender, isReliable);
    }

    parsePacket(reader: HazelReader) {
        const sendOption: SendOption = reader.uint8();
        switch (sendOption) {
            case SendOption.Unreliable: return UnreliablePacket.deserializeFromReader(reader);
            case SendOption.Reliable: return ReliablePacket.deserializeFromReader(reader);
            case SendOption.Hello:
                return this.config.socket.useDtlsLayout
                    ? DtlsHelloPacket.deserializeFromReader(reader)
                    : HelloPacket.deserializeFromReader(reader);
            case SendOption.Disconnect: return DisconnectPacket.deserializeFromReader(reader);
            case SendOption.Acknowledge: return AcknowledgePacket.deserializeFromReader(reader);
            case SendOption.Ping: return PingPacket.deserializeFromReader(reader);
            default:
                return undefined;
        }
    }

    async handlePacket(rootPacket: BaseRootPacket, sender: Connection) {
        if (rootPacket instanceof UnreliablePacket || rootPacket instanceof ReliablePacket) {
            for (const message of rootPacket.children) {
                await this.handleRootMessageUnknown(message, sender, rootPacket instanceof ReliablePacket);
            }
            return;
        }
        if (rootPacket instanceof HelloPacket || rootPacket instanceof DtlsHelloPacket) {
            return await this.handleHello(rootPacket, sender);
        }
        if (rootPacket instanceof DisconnectPacket) return await this.handleDisconnectPacket(rootPacket, sender);
        if (rootPacket instanceof AcknowledgePacket) return await this.handleAcknowledgePacket(rootPacket, sender);
        if (rootPacket instanceof PingPacket) {
            // we don't actually need to do anything for ping packets sent by the client, lol
            return;
        }

        this.logger.error("Unknown send option to handle, with tag %s",
            SendOption[rootPacket.messageTag] || rootPacket.messageTag);
    }

    /**
     * Handle a message being received via the udp socket.
     * @param buffer The raw data buffer that was received.
     * @param rinfo Information about the remote that sent this data.
     */
    async handleMessage(listenSocket: dgram.Socket, buffer: Buffer, rinfo: dgram.RemoteInfo, deltaPort?: number) {
        try {
            const parsedPacket = this.parsePacket(HazelReader.from(buffer));

            if (!parsedPacket) {
                const connection = this.getOrCreateConnection(listenSocket, rinfo, deltaPort);
                this.logger.warn("%s sent an unknown root packet (%s)", connection, buffer[0]);
                return;
            }

            const parsedReliable = parsedPacket as ReliableSerializable;

            const connectionKey = deltaPort ? "delta:" + deltaPort : rinfo.address + ":" + rinfo.port;
            const cachedConnection = this.connections.get(connectionKey);

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

                        /**
                         * Patches a bug with reactor whereby the nonce sent for the mod declaration is 0,
                         * this fixes TOU as well.
                         */
                        // const isBadReactor = parsedReliable.messageTag === SendOption.Reliable
                        //     && parsedReliable.nonce === 0
                        //     && (parsedReliable as ReliablePacket)
                        //         .children.every(child => {
                        //             return child instanceof ReactorMessage
                        //                 && child.children[0].messageTag === ReactorMessageTag.ModDeclaration;
                        //         });

                        // if (!isBadReactor && parsedReliable.nonce < cachedConnection.nextExpectedNonce - 1) {
                        //     this.logger.warn("%s is behind (got %s, last nonce was %s)",
                        //         cachedConnection, parsedReliable.nonce, cachedConnection.nextExpectedNonce - 1);
                        //     return;
                        // }

                        // if (!isBadReactor && parsedReliable.nonce !== cachedConnection.nextExpectedNonce && this.config.socket.messageOrdering) {
                        //     this.logger.warn("%s holding packet with nonce %s, expected %s",
                        //         cachedConnection, parsedReliable.nonce, cachedConnection.nextExpectedNonce);

                        //     if (!cachedConnection.unorderedMessageMap.has(parsedReliable.nonce)) {
                        //         cachedConnection.unorderedMessageMap.set(parsedReliable.nonce, parsedReliable);
                        //     }

                        //     return;
                        // }

                        // if (!isBadReactor) {
                        //     cachedConnection.nextExpectedNonce++;
                        // }
                    }
                    
                    await this.handlePacket(parsedPacket, cachedConnection);

                    if (isReliable && this.config.socket.messageOrdering) {
                        // eslint-disable-next-line no-constant-condition
                        while (true) {
                            const nextMessage = cachedConnection.unorderedMessageMap.get(cachedConnection.nextExpectedNonce);
                            if (!nextMessage)
                                break;

                            await this.handlePacket(nextMessage, cachedConnection);

                            cachedConnection.unorderedMessageMap.delete(cachedConnection.nextExpectedNonce);
                            cachedConnection.nextExpectedNonce++;
                        }
                    }
                } else {
                    if (parsedReliable.messageTag !== SendOption.Hello)
                        return;

                    const connection = cachedConnection || new Connection(this, listenSocket, rinfo, this.getNextClientId());
                    if (deltaPort) connection.deltaPort = deltaPort;
                    if (!cachedConnection)
                        this.connections.set(connectionKey, connection);

                    connection.nextExpectedNonce = parsedReliable.nonce + 1;

                    await this.handlePacket(parsedPacket, connection);
                }
            } catch (e) {
                const connection = this.getOrCreateConnection(listenSocket, rinfo, deltaPort);
                this.logger.error("Error occurred while processing packet from %s:",
                    connection);
                console.log(e);
            }
        } catch (e) {
            const connection = this.getOrCreateConnection(listenSocket, rinfo, deltaPort);
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
    generateRoomCode(len: 4 | 6) {
        if (len !== 4 && len !== 6) {
            throw new RangeError("Expected to generate a 4 or 6 digit room code.");
        }

        let roomCode = len === 4 ? RoomCode.generateRandom(RoomCodeVersion.V1) : RoomCode.generateRandom(RoomCodeVersion.V2);
        while (this.rooms.get(roomCode.id))
            roomCode = len === 4 ? RoomCode.generateRandom(RoomCodeVersion.V1) : RoomCode.generateRandom(RoomCodeVersion.V2);

        return roomCode;
    }

    /**
     * Create a room on this server.
     * @param roomCode The game code for the room, see {@link WaterwayServer.generateRoomCode}
     * to generate one.
     * @param options Game options for the room.
     * @param createdBy The client who is creating the room, if any.
     * @returns The created room.
     */
    async createRoom(roomCode: RoomCode, options: GameSettings, createdBy: Connection | undefined) {
        if (this.rooms.has(roomCode.id))
            throw new Error("A room with code '" + roomCode + "' already exists.");

        const copyConfiguration: RoomsConfig = {
            ...this.config.rooms
        };

        const createdRoom = new Room(this, roomCode, copyConfiguration, options, createdBy);
        createdRoom.workerPlugins = new Map(this.loadedPlugins.entries());
        await this.pluginLoader.loadAllRoomPlugins(createdRoom);
        this.rooms.set(roomCode.id, createdRoom);

        createdRoom.emit(
            new RoomCreateEvent(createdRoom)
        );

        return createdRoom;
    }

    async attemptJoin(connection: Connection, roomCode: RoomCode) {
        const foundRoom = this.rooms.get(roomCode.id);

        const ev = await this.emit(
            new WorkerBeforeJoinEvent(
                connection,
                roomCode,
                foundRoom
            )
        );

        if (ev.canceled)
            return;

        if (!ev.alteredRoom) {
            this.logger.info("%s attempted to join %s but there was no room with that code",
                connection, roomCode);

            return connection.disconnect(DisconnectReason.GameNotFound);
        }

        if (ev.alteredRoom.bannedAddresses.has(connection.remoteInfo.address)) {
            this.logger.warn("%s attempted to join %s but they were banned",
                connection, foundRoom);
            return connection.disconnect(DisconnectReason.Banned);
        }

        // Only block if room is actually full with DIFFERENT players.
        // A player reconnecting after game end should not be blocked by
        // their own previous Player entry still being in the room.
        const roomPlayerCount = ev.alteredRoom.players.size;
        const alreadyInRoom = ev.alteredRoom.players.has(connection.clientId);
        const effectiveCount = alreadyInRoom ? roomPlayerCount - 1 : roomPlayerCount;
        if (effectiveCount >= ev.alteredRoom.settings.maxPlayers) {
            this.logger.warn("%s attempted to join %s but it was full",
                connection, foundRoom);
            return connection.disconnect(DisconnectReason.GameFull);
        }

        if (ev.alteredRoom.gameState === GameState.Started) {
            this.logger.warn("%s attempted to join %s but the game had already started",
                connection, foundRoom);
            return connection.disconnect(DisconnectReason.GameStarted);
        }

        const roomHost = ev.alteredRoom.playerAuthority;
        if (ev.alteredRoom.config.checkChatMode && roomHost) {
            const hostConnection = ev.alteredRoom.connections.get(roomHost.clientId);
            if (hostConnection && hostConnection.chatMode !== ev.client.chatMode) {
                if (hostConnection.chatMode === QuickChatMode.FreeChat) {
                    this.logger.warn("%s attempted to join %s with the wrong chat mode (the room was on free-chat only)",
                        ev.client, ev.alteredRoom);
                    return connection.disconnect(i18n.invalid_quick_chat_mode_free_chat);
                } else if (hostConnection.chatMode === QuickChatMode.QuickChat) {
                    this.logger.warn("%s attempted to join %s with the wrong chat mode (the room was on quick-chat only)",
                        ev.client, ev.alteredRoom);
                    return connection.disconnect(i18n.invalid_quick_chat_mode_quick_chat);
                }
            }
        }

        this.logger.info("%s joining room %s",
            connection, ev.alteredRoom);

        await ev.alteredRoom.handleRemoteJoin(connection);
    }
}
