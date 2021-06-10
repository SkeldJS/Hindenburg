import chalk from "chalk";
import winston from "winston";

import { DisconnectReason, GameMap, Hostable } from "@skeldjs/core";

import {
    BaseGameDataMessage,
    BaseRootMessage,
    GameDataMessage,
    GameDataToMessage,
    GameOptions,
    HostGameMessage,
    JoinedGameMessage,
    JoinGameMessage,
    ReliablePacket,
    RemoveGameMessage,
    RemovePlayerMessage
} from "@skeldjs/protocol";

import { Code2Int, Int2Code } from "@skeldjs/util";

import { ClientConnection } from "./Connection";
import { Player } from "./Player";
import { Worker } from "./Worker";

enum SpecialId {
    Nil = 2 ** 31 - 1
}

const logMaps = {
    [GameMap.TheSkeld]: "the skeld",
    [GameMap.MiraHQ]: "mira",
    [GameMap.Polus]: "polus",
    [GameMap.AprilFoolsTheSkeld]: "skeld april fools",
    [GameMap.Airship]: "airship"
}

export class Room {
    public readonly _internal: Hostable;

    logger: winston.Logger;
    
    connections: Map<number, ClientConnection>;
    players: Map<number, Player>;
    bans: Set<string>;

    code: number;

    constructor(
        public readonly worker: Worker,
        public readonly options: GameOptions
    ) {
        this._internal = new Hostable;

        this.logger = winston.createLogger({
            transports: [
                new winston.transports.Console({
                    format: winston.format.combine(
                        winston.format.splat(),
                        winston.format.colorize(),
                        winston.format.printf(info => {
                            return `[${Int2Code(this.code)}] ${info.level}: ${info.message}`;
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
        
        this._internal.on("player.chat", chat => {
            const player = this.players.get(chat.player.id);
            this.logger.info(
                "%s chat message: %s",
                player, chalk.red("\"" + chat.chatMessage + "\"")
            );
        });

        this.connections = new Map;
        this.players = new Map;
        this.bans = new Set;

        this.code = 0;
    }

    [Symbol.for("nodejs.util.inspect.custom")]() {
        let paren = logMaps[this.options.map] + ", "
            + this.players.size + "/" + this.options.maxPlayers + " players";

        return chalk.yellow(Int2Code(this.code)) + " " + chalk.grey("(" + paren + ")");
    }

    /**
     * The host player of this room.
     */
    get host() {
        return this.players.get(this._internal.hostid);
    }

    /**
     * Broadcast [GameData messages](https://github.com/codyphobe/among-us-protocol/blob/master/03_gamedata_and_gamedatato_message_types/README.md)
     * and root messages to all or some connections.
     * 
     * Sends GameDataTo if a filter is applied with {@link include}.
     * @param gamedata The [GameData messages](https://github.com/codyphobe/among-us-protocol/blob/master/03_gamedata_and_gamedatato_message_types/README.md)
     * to send.
     * @param payload The [Root messages](https://github.com/codyphobe/among-us-protocol/blob/master/02_root_message_types/README.md)
     * to send.
     * @param include The connections to include in the broadcast.
     * @param exclude The connections to exclude in the broadcast.
     * @returns A promise that resolves when all packets have been sent.
     * @example
     * ```ts
     * // Broadcast a scenechange message.
     * await room.broadcastMessages([
     *   new SceneChangeMessage(0, "OnlineGame")
     * ]);
     * ```
     */
    async broadcastMessages(
        gamedata: BaseGameDataMessage[],
        payload: BaseRootMessage[] = [],
        include?: ClientConnection[],
        exclude?: ClientConnection[]
    ) {
        const clientsToBroadcast = include || [...this.connections.values()];
        const clientsToExclude = new Set(exclude);
        const promises: Promise<void>[] = [];

        for (const client of clientsToBroadcast) {
            if (clientsToExclude.has(client))
                continue;

            const messages = [
                ...(gamedata.length ?
                    [
                        include
                            ? new GameDataToMessage(
                                this.code,
                                client.clientid,
                                gamedata
                            )
                            : new GameDataMessage(
                                this.code,
                                gamedata
                            )
                    ]
                    : []),
                ...payload
            ] as BaseRootMessage[];

            promises.push(
                client.sendPacket(
                    new ReliablePacket(
                        client.getNextNonce(),
                        messages
                    )
                )
            );
        }

        await Promise.all(promises);
    }

    /**
     * Destroy this room, broadcasting a [RemoveGame](https://github.com/codyphobe/among-us-protocol/blob/master/02_root_message_types/03_removegame.md)
     * message to all clients.
     */
    async destroy() {
        await this.broadcastMessages([], [
            new RemoveGameMessage(DisconnectReason.ServerRequest)
        ]);

        this.worker.rooms.delete(this.code);
    }

    /**
     * Handle a client attempting to join this room.
     * 
     * See https://github.com/codyphobe/among-us-protocol/blob/master/02_root_message_types/01_joingame.md
     * for more information.
     * @param connection The client that is joining.
     */
    async handleJoin(connection: ClientConnection) {
        // todo: handle wait for host. https://github.com/codyphobe/among-us-protocol/blob/master/02_root_message_types/01_joingame.md#client-to-server

        const playerData = await this._internal.handleJoin(connection.clientid);
        if (!playerData)
            throw new Error("Client is already connected to the room.");

        const player = new Player(connection, this, playerData);

        if (this.connections?.size === 0) {
            await this.setHost(connection, false);
        }

        await this.broadcastMessages([], [
            new JoinGameMessage(
                this.code,
                connection.clientid,
                this._internal.hostid
            )
        ]);

        await connection.sendPacket(
            new ReliablePacket(
                connection.getNextNonce(),
                [
                    new JoinedGameMessage(
                        this.code,
                        connection.clientid,
                        this._internal.hostid,
                        [...this.connections.values()]
                            .map(connection => connection.clientid)
                    )
                ]
            )
        );
        
        this.connections.set(connection.clientid, connection);
        this.players.set(connection.clientid, player);
        connection.room = this;
    }

    /**
     * Handling a client leaving or being kicked from the room.
     * @param connection The client that is leaving.
     * @param reason The reason for why the client is leaving.
     */
    async handleLeave(connection: ClientConnection, reason: DisconnectReason) {
        if (!this.connections.has(connection.clientid))
            throw new Error("Client is not connected to the room.");

        await this._internal.handleLeave(connection.clientid);

        await this.broadcastMessages([], [
            new RemovePlayerMessage(
                this.code,
                connection.clientid,
                reason,
                connection.clientid
            )
        ]);

        this.connections.delete(connection.clientid);
        this.players.delete(connection.clientid);
        connection.room = undefined;

        if (connection.clientid === this._internal.hostid) {
            if (this.connections.size) {
                await this.setHost(
                    [...this.connections.values()][0],
                    false
                );
            } else {
                await this.setHost(undefined, false);
            }
        }
    }

    /**
     * Set the game code of the room.
     * @param code The game code as either an integer or a string.
     * @example
     * ```ts
     * // Set the code of the room to "ABCDEF";
     * const room = new Room(worker);
     * room.setCode("ABCDEF");
     * ```
     */
    async setCode(code: number|string): Promise<void> {
        if (typeof code === "string") {
            if (code.length !== 4 && code.length !== 6) {
                throw new RangeError("Expected a 4 or 6 digit room code.");
            }

            return this.setCode(Code2Int(code));
        }

        if (this.worker.rooms.has(code))
            throw new Error("A room with code '" + Int2Code(code) + "' already exists.");

        await this.broadcastMessages([], [
            new HostGameMessage(code)
        ]);

        this.worker.rooms.set(code, this);
        this.worker.rooms.delete(this.code);
        this.code = code;
    }

    /**
     * Change the host of the room.
     * @param host The client to set as host.
     * @param broadcast Whether to immediately broadcast the host update.
     */
    async setHost(host: ClientConnection|undefined, broadcast: boolean = true) {
        if (broadcast) {
            await this.broadcastMessages([], [
                new JoinGameMessage(
                    this.code,
                    SpecialId.Nil,
                    host ? host.clientid : SpecialId.Nil
                ),
                new RemovePlayerMessage(
                    this.code,
                    SpecialId.Nil,
                    DisconnectReason.None,
                    host ? host.clientid : SpecialId.Nil
                )
            ]);
        }
        this._internal.hostid = host ? host.clientid : 0;
    }
}