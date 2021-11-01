import { AllGameSettings } from "@skeldjs/protocol";

export interface AnticheatPenalty {
    /**
     * The action that should be applied on this user for breaking this rule.
     */
    action?: "disconnect"|"ban"|"ignore";
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
    rules: Record<string, AnticheatRuleConfig|string|number|boolean>;
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
    value: string|number|boolean;
    /**
     * Configuration for each individual sub-rule.
     */
    rules: Record<string, AnticheatRuleConfig|string|number|boolean>;
}

export interface PluginConfig {
    /**
     * Whether to load all plugins in the plugin directory.
     * @default true
     */
    loadDirectory: boolean;
    [key: string]: boolean|Record<string, unknown>;
}

export interface SocketConfig {
    /**
     * The port to listen on.
     * @default 22023
     */
    port: number;
    /**
     * Whether or not to broadcast gamedata messages that don't get handled by the server.
     * @default false
     */
    broadcastUnknownGamedata: boolean;
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
}

export type ConnectionsFormatOptions = "id"|"ip"|"ping"|"room"|"language";
export type RoomFormatOptions = "players"|"map";
export type PlayerFormatOptions = "id"|"ping"|"ishost";

export interface LoggingConfig {
    /**
     * Whether to hide sensitive information from logging, such as ip addresses.
     */
    hideSensitiveInfo: boolean;
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
         * @saah Whether or not the room is in SaaH.
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
         * @default ["players", "map", "saah"]
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

export interface ReactorModConfig {
    /**
     * Whether this mod is optional, and clients can connect without it. If the
     * client does have this mod, then it still must be the same version as the
     * one specified in {@link ReactorModConfig.version}.
     * @default false
     */
    optional: boolean;
    /**
     * Whether this mod is banned, only really applies when {@link ReactorConfig.allowExtraMods}
     * is enabled, as otherwise, only mods in the {@link ReactorConfig.mods} would
     * be accepted anyway.
     * @default false
     */
    banned: boolean;
    /**
     * Enforce a specific version glob for this mod.
     * @default *
     */
    version: string;
    /**
     * Whether to broadcast messages sent by this mod.
     * @default true
     */
    doNetworking: boolean;
}

export interface ReactorConfig {
    /**
     * Whether to block reactor RPCs from mods that are declared as being client-side-only.
     * @default true
     */
    blockClientSideOnly: boolean;
    /**
     * Individual configuration for each mod in regards to how Hindenburg should
     * treat them.
     */
    mods: Record<string, ReactorModConfig|boolean>;
    /**
     * Whether to allow extra mods aside from those in {@link ReactorConfig.mods},
     * which would still be used to enforce certain version of mods, and to require
     * certain mods.
     * @default true
     */
    allowExtraMods: boolean;
    /**
     * Whether to allow normal clients to connect.
     * @default false
     */
    allowNormalClients: boolean;
    /**
     * Whether or not to require joining clients to have the same mods as the host.
     * @default true
     */
    requireHostMods: boolean;
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

export interface RoomsConfig {
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
    chatCommands: boolean|ChatCommandConfig;
    /**
     * Options regarding room plugins.
     */
    plugins: PluginConfig;
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
     * Whether the server should act as the host of the room. (experimental)
     * @default false
     */
    serverAsHost: boolean;
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
}

export interface ServerPlayerOptions {
    /**
     * The name of the player for a message sent by the server in game chat
     */
    name?: string;
    /**
     * The color of the player for a message sent by the server in game chat
     */
    color?: string;
    /**
     * The hat of the player for a message sent by the server in game chat
     */
    hat?: string;
    /**
     * The skin of the player for a message sent by the server in game chat
     */
    skin?: string;
}

export interface HindenburgConfig {
    /**
     * An array of game versions that Hindenburg will accept.
     * @default ["2021.6.30"]
     */
    versions: string[];
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
     * Options regarding the socket that the server listens on.
     */
    socket: SocketConfig;
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
     * Options for Hindenburg's reactor integration. Set to `true` to force
     * reactor, allow any mods and require clients joining a room to have the
     * same mods as the host.
     */
    reactor: ReactorConfig|boolean;
    /**
     * Configuration for rooms, such as enabling/disabling features
     */
    rooms: RoomsConfig;
}
