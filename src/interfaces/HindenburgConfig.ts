import { AllGameSettings } from "@skeldjs/protocol";
import { Filters, StatefulRoomConfig } from "@skeldjs/core";

export interface PluginConfig {
    /**
     * Whether to load all plugins in the plugin directory.
     * @default true
     */
    loadDirectory: boolean;
    [key: string]: boolean | Record<string, unknown>;
}

export interface MatchmakerConfig {
    /**
     * The port that the matchmaker should listen on.
     * @default 22021
     */
    port: number;
}

export interface SocketConfig {
    /**
     * The port to listen on.
     * @default 22023
     */
    port: number;
    /**
     * Any additional ports for Hindenburg to listen on.
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
}

export interface AnticheatPenalty {
    /**
     * The action that should be applied on this user for breaking this rule.
     */
    action?: "disconnect" | "ban" | "ignore";
    /**
     * The number of strikes that this user has before they are penalised.
     */
    strikes?: number;
    /**
     * The number of general disconnects the player should have to have had
     * for breaking this rule until they are banned.
     */
    banAfterXDisconnects?: number;
    /**
     * The length, in seconds, of how long to ban a player for breaking this
     * rule.
     */
    banDuration?: number;
    /**
     * The message to give this player when disconnecting or banning this player.
     */
    disconnectMessage?: string;
}

export interface AnticheatConfig {
    /**
     * Global penalties for players brekaing any rule.
     */
    penalty: AnticheatPenalty;
    /**
     * Configuration for each individual rule.
     */
    rules: Record<string, AnticheatRuleConfig | string | number | boolean>;
}

export interface AnticheatRuleConfig {
    /**
     * The penalty to give a player for breaking this rule.
     */
    penalty: AnticheatPenalty;
    /**
     * The value of this rule, a boolean if it's a simple toggle,
     * or an integer or string if it requires more specific configuration.
     */
    value: string | number | boolean;
    /**
     * Configuration for each individual sub-rule.
     */
    rules: Record<string, AnticheatRuleConfig | string | number | boolean>;
}

export type ConnectionsFormatOptions = "id" | "ip" | "ping" | "room" | "level" | "version" | "platform" | "language";
export type RoomFormatOptions = "players" | "map" | "host" | "privacy";
export type PlayerFormatOptions = "id" | "ping" | "level" | "ishost" | "platform" | "language";

export interface LoggingConfig {
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
         * @id The client's client id.
         * @ip The client's ip address.
         * @ping The client's round-trip ping.
         * @room The client's current room code.
         * @language The client's language.
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
         * @players The total number of players currently connected to the room.
         * @map The map that the room is currently playing.
         * @host The host player of the room, or the server.
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
         * @id The client ID of the player.
         * @ping The player's round-trip ping.
         * @ishost Whether this player is host. (Not displayed if the player is
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

export interface GameListingConfig {
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
     * terms. Otherwise, Hindenburg will sort results by relevance to the search
     * terms.
     * @default false
     */
    requireExactMatches: boolean;
}

export interface ChatCommandConfig {
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

export interface ServerPlayerOptions {
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

export interface AdvancedRoomOptions {
    /**
     * In-game object types for Hindenburg to ignore and treat as unknown
     * objects.
     *
     * Pass `false` to ignore no object types and ban uknown object types,
     * or 'true' for Hindenburg to ignore any unknown objects.
     *
     * Pass `all` to ignore _every_ object type and treat all of them as uknown,
     * including standard Among Us objects.
     *
     * Alternatively, pass an array of either spawn type ids or members of the
     * {@link SpawnType} enum of the objects to ignore and treat as unknown.
     *
     * This will allow objects with a spawn type unknown to Hindenburg to spawn,
     * making it useful for custom modded maps or mods that use custom objects that
     * aren't implemented on the server. Note that any of these objects spawned
     * can't be handled by Hindenburg, so they will be incompatible with
     * {@link RoomsConfig.authoritativeServer}.
     * @default false
     */
    unknownObjects: "all" | boolean | (string | number)[];
}

export interface RoomsConfig extends StatefulRoomConfig {
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
     */
    enforceSettings: Partial<AllGameSettings>;
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

export interface MovementOptimizations {
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

export interface OptimizationsConfig {
    /**
     * Options regarding movement packets, since they are the most frequent and
     * most likely to put a lot of strain on the server.
     */
    movement: MovementOptimizations;
    /**
     * Whether or not to completely disable the perspective API for Hindenburg.
     * @default false
     */
    disablePerspectives: boolean;
}

export interface HindenburgConfig {
    /**
     * Relative or absolute path to other Hindenburg config(s) to base this one off, to extend all values from.
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
     * Whether or not to auto-update Hindenburg when there is an update available.
     * @default false
     */
    autoUpdate: boolean;
    /**
     * Whether or not to confirm when pressing CTRL+C to close Hindenburg.
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
     * Configuration for the included Hindenburg http matchmaker.
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
     * Advanced options for HACS, Hindenburg's Anti-Cheat System.
     */
    anticheat: AnticheatConfig;
    /**
     * Options for logging.
     */
    logging: LoggingConfig;
    /**
     * Configuration for rooms, such as enabling/disabling features
     */
    rooms: RoomsConfig;
    /**
     * Options regarding different optimisations that Hindenburg can use to perform
     * better in high-load scenarios.
     */
    optimizations: OptimizationsConfig
}
