export interface AnticheatConfig {
    penalty: {
        action?: "disconnect"|"ban"|"ignore";
        strikes?: number;
        banAfterXDisconnects?: number;
        banDuration?: number;
        disconnectMessage?: string;
    }
    rules: Record<string, AnticheatRuleConfig>;
}

export interface AnticheatRuleConfig {
    penalty: {
        action?: "disconnect"|"ban"|"ignore";
        strikes?: number;
        banAfterXDisconnects?: number;
        banDuration?: number;
        disconnectMessage?: string;
    };
    [key: string]: any;
}

export interface PluginConfig {
    loadDirectory: boolean;
    [key: string]: any;
}

export interface SocketConfig {
    port: number;
}

export type ConnectionsFormatOptions = "id"|"ip"|"ping"|"room"|"language";
export type RoomFormatOptions = "players"|"map";
export type PlayerFormatOptions = "id"|"ping"|"ishost";

export interface LoggingConfig {
    /**
     * Whether to hide sensitive information from logging, such as ip addresses.
     */
    hideSensitiveInfo?: boolean;
    /**
     * Logging options for client connections.
     */
    connections?: {
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
         * @default
         * ```json
         * {
         *     "format": ["id", "ip", "ping", "room"]
         * }
         * 
         * // => weakeyes (140, 127.0.0.1, 53ms, ABCDEF)
         * ```
         */
        format?: ConnectionsFormatOptions[];
    };
    /**
     * Logging options for game rooms.
     */
    rooms?: {
        /**
         * Custom formatting for the extra information provided when rooms are
         * logged. (The part in parenthesis after the game code.)
         * 
         * @players The total number of players currently connected to the room.
         * @map The map that the room is currently playing.
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
         * @default
         * ```json
         * {
         *     "format": ["players", "map"]
         * }
         * 
         * // => ABCDEF (5/15 players, polus)
         * ```
         */
        format?: RoomFormatOptions[]
    };
    /**
     * Logging options for logging players in-game.
     */
    players?: {
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
         * @default
         * ```json
         * {
         *     "format": ["id", "ping", "ishost"]
         * }
         * 
         * // => weakeyes (104, 50ms, host)
         * ```
         */
        format?: PlayerFormatOptions[]
    };
}

export interface HindenburgConfig {
    /**
     * An array of game versions that Hindenburg will accept.
     */
    versions: string[];
    /**
     * The name of the cluster that this node belongs to.
     */
    clusterName: string;
    /**
     * The ID of this node in relation to other nodes in the cluster.
     */
    nodeId: number;
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
}