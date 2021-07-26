import chalk from "chalk";
import winston from "winston";

import {
    AlterGameTag,
    Color,
    DisconnectReason,
    GameMap,
    GameOverReason,
    GameState,
    SpawnType
} from "@skeldjs/constant";

import {
    AlterGameMessage,
    BaseGameDataMessage,
    BaseRootMessage,
    ComponentSpawnData,
    DataMessage,
    DespawnMessage,
    EndGameMessage,
    GameDataMessage,
    GameDataToMessage,
    GameSettings,
    HostGameMessage,
    JoinedGameMessage,
    JoinGameMessage,
    ReliablePacket,
    RemoveGameMessage,
    RemovePlayerMessage,
    RpcMessage,
    SendChatMessage,
    SetColorMessage,
    SetNameMessage,
    SpawnMessage,
    StartGameMessage,
    UnreliablePacket,
    WaitForHostMessage
} from "@skeldjs/protocol";

import { Hostable, HostableEvents, PlayerData, RoomFixedUpdateEvent } from "@skeldjs/core";
import { BasicEvent, ExtractEventTypes } from "@skeldjs/events";

import { Code2Int, HazelWriter } from "@skeldjs/util";

import { VorpalConsole } from "./util/VorpalConsoleTransport";
import { SendChatOptions, MessageSide } from "./interfaces";

import { Connection } from "./Connection";
import { Worker } from "./Worker";

import {
    RoomBeforeDestroyEvent,
    RoomDestroyEvent
} from "./api";

import { fmtCode } from "./util/fmtCode";
import { fmtLogFormat } from "./util/fmtLogFormat";
import { RoomsConfig } from "./interfaces";
import { CommandCallError, ChatCommandContext, Plugin } from "./handlers";

(PlayerData.prototype as any)[Symbol.for("nodejs.util.inspect.custom")] = function (this: PlayerData<Room>) {
    const connection = this.room.connections.get(this.id);

    const paren = fmtLogFormat(
        this.room.worker.config.logging.players?.format || ["id", "ping", "ishost"],
        {
            id: this.id,
            ping: connection?.roundTripPing,
            ishost: this.ishost ? "host" : undefined
        }
    );

    return chalk.blue(this.info?.name || "<No Name>")
        + (paren ? " " + chalk.grey("(" + paren + ")") : "");
}

export enum SpecialClientId {
    Nil = 2 ** 31 - 1,
    Server = 2 ** 31 - 2,
    Temp = 2 ** 31 - 3
}

const logMaps = {
    [GameMap.TheSkeld]: "the skeld",
    [GameMap.MiraHQ]: "mira hq",
    [GameMap.Polus]: "polus",
    [GameMap.AprilFoolsTheSkeld]: "skeld april fools",
    [GameMap.Airship]: "airship"
};

export type RoomEvents = HostableEvents<Room> & ExtractEventTypes<[
    RoomBeforeDestroyEvent,
    RoomDestroyEvent
]>;

export class Room extends Hostable<RoomEvents> {
    createdAt: number;
    connections: Map<number, Connection>;
    waiting: Set<Connection>;

    /**
     * This room's console logger.
     */
    logger: winston.Logger;

    /**
     * All IP addresses banned from this room.
     */
    bans: Set<string>;

    state: GameState;

    constructor(
        public readonly worker: Worker,
        public readonly config: RoomsConfig, // todo: handle plugins & enforce settings configs
        settings: GameSettings
    ) {
        super({ doFixedUpdate: true });

        this.createdAt = Date.now();
        this.connections = new Map;
        this.waiting = new Set;

        this.logger = winston.createLogger({
            transports: [
                new VorpalConsole(this.worker.vorpal, {
                    format: winston.format.combine(
                        winston.format.splat(),
                        winston.format.colorize(),
                        winston.format.printf(info => {
                            return `[${fmtCode(this.code)}] ${info.level}: ${info.message}`;
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

        this.bans = new Set;
        this.settings = settings;

        this.state = GameState.NotStarted;

        this.on("player.setname", ev => {
            if (ev.oldName) {
                this.logger.info("%s changed their name from %s to %s",
                    ev.player, ev.oldName, ev.newName);
            } else {
                this.logger.info("%s set their name to %s",
                    ev.player, ev.newName);
            }
        });

        this.on("player.chat", async ev => {
            this.logger.info("%s sent message: %s",
                ev.player, chalk.red(ev.chatMessage));
                
            if (ev.chatMessage.startsWith("/") && this.config.chatCommands) {
                const room = this.worker.rooms.get(ev.room.code);
                
                if (!room)
                    return;

                ev.message?.cancel(); // Prevent message from being broadcasted
                const restMessage = ev.chatMessage.substr(1);
                const context = new ChatCommandContext(room, ev.player, ev.chatMessage);
                try {
                    await this.worker.chatCommandHandler.parseMessage(context, restMessage);
                } catch (e) {
                    if (e instanceof CommandCallError) {
                        await context.reply(e.message);
                    } else {
                        this.worker.logger.error("Error while executing command %s: %s",
                            ev.chatMessage, e);
                    }
                }
            }
        });

        this.on("player.syncsettings", async ev => {
            if (this.config.enforceSettings) {
                ev.setSettings(this.config.enforceSettings);
            }
        });
    }

    async emit<Event extends RoomEvents[keyof RoomEvents]>(
        event: Event
    ): Promise<Event>;
    async emit<Event extends BasicEvent>(event: Event): Promise<Event>;
    async emit<Event extends BasicEvent>(event: Event): Promise<Event> {
        await this.worker.emit(event);

        return super.emit(event);
    }

    [Symbol.for("nodejs.util.inspect.custom")]() {
        const paren = fmtLogFormat(
            this.worker.config.logging.rooms?.format || ["players", "map"],
            {
                players: this.players.size + "/" + this.settings.maxPlayers + " players",
                map: logMaps[this.settings.map]
            }
        );

        return fmtCode(this.code)
            + (paren ? " " + chalk.grey("(" + paren + ")") : "");
    }

    get name() {
        return fmtCode(this.code);
    }

    get destroyed() {
        return this.state === GameState.Destroyed;
    }

    async destroy(reason = DisconnectReason.Destroy) {
        const ev = await this.emit(new RoomBeforeDestroyEvent(this, reason));

        if (ev.canceled) {
            return;
        }

        super.destroy();

        await this.broadcastMessages([], [
            new RemoveGameMessage(reason)
        ]);

        this.state = GameState.Destroyed;
        this.worker.rooms.delete(this.code);

        this.emit(new RoomDestroyEvent(this));

        this.logger.info("Room was destroyed.");
    }

    async FixedUpdate() {
        const delta = Date.now() - (this as any).last_fixed_update;
        (this as any).last_fixed_update = Date.now();
        for (const [, component] of this.netobjects) {
            if (
                component
            ) {
                component.FixedUpdate(delta / 1000);
                if (component.dirtyBit) {
                    component.PreSerialize();
                    const writer = HazelWriter.alloc(0);
                    if (component.Serialize(writer, false)) {
                        this.stream.push(
                            new DataMessage(component.netid, writer.buffer)
                        );
                    }
                    component.dirtyBit = 0;
                }
            }
        }

        const ev = await this.emit(
            new RoomFixedUpdateEvent(
                this,
                this.stream
            )
        );

        if (this.stream.length) {
            const stream = this.stream;
            this.stream = [];

            if (!ev.canceled) await this.broadcast(stream);
        }
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
        include?: Connection[],
        exclude?: Connection[],
        reliable = true
    ) {
        const clientsToBroadcast = include || [...this.connections.values()];
        const clientsToExclude = new Set(exclude);
        const promises: Promise<void>[] = [];

        for (const connection of clientsToBroadcast) {
            if (clientsToExclude.has(connection))
                continue;

            const messages = [
                ...(gamedata.length ?
                    [
                        include
                            ? new GameDataToMessage(
                                this.code,
                                connection.clientId,
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

            if (messages.length) {
                promises.push(
                    connection.sendPacket(
                        reliable
                            ? new ReliablePacket(
                                connection.getNextNonce(),
                                messages
                            )
                            : new UnreliablePacket(messages)
                    )
                );
            }
        }

        await Promise.all(promises);
    }

    async broadcast(
        messages: BaseGameDataMessage[],
        reliable: boolean = true,
        recipient: PlayerData | undefined = undefined,
        payloads: BaseRootMessage[] = []
    ) {
        const recipientConnection = recipient
            ? this.connections.get(recipient.id)
            : undefined;
            
        return this.broadcastMessages(messages, payloads, recipientConnection ? [recipientConnection] : undefined);
    }

    async setCode(code: number|string): Promise<void> {
        if (typeof code === "string") {
            return this.setCode(Code2Int(code));
        }

        if (this.code) {
            this.logger.info(
                "Game code changed to [%s]",
                fmtCode(code) 
            );
        }

        super.setCode(code);

        await this.broadcastMessages([], [
            new HostGameMessage(code)
        ]);
    }

    async updateHost(client: Connection) {
        await this.broadcastMessages([], [
            new JoinGameMessage(
                this.code,
                -1,
                client.clientId
            ),
            new RemovePlayerMessage(
                this.code,
                -1,
                DisconnectReason.None,
                client.clientId
            )
        ]);
    }

    async setHost(player: PlayerData) {
        const remote = this.connections.get(player.id);

        await super.setHost(player);

        if (remote && this.state === GameState.Ended && this.waiting.has(remote)) {
            await this.handleRemoteJoin(remote);
        }

        this.logger.info(
            "Host changed to %s",
            player
        );
    }

    async handleRemoteLeave(client: Connection, reason: DisconnectReason = DisconnectReason.None) {
        await this.handleLeave(client.clientId);

        this.connections.delete(client.clientId);

        if (this.players.size === 0) {
            await this.destroy();
            return;
        }

        await this.setHost([...this.players.values()][0]);

        await this.broadcastMessages([], [
            new RemovePlayerMessage(
                this.code,
                client.clientId,
                reason,
                this.hostid
            )
        ]);

        this.logger.info(
            "%s left or was removed.",
            client
        );
    }

    async handleRemoteJoin(client: Connection) {
        const player = await this.handleJoin(client.clientId);

        if (!player)
            return;

        if (!this.host)
            await this.setHost(player);

        client.room = this;

        if (this.state === GameState.Ended) {
            if (client.clientId === this.hostid) {
                this.state = GameState.NotStarted;
                this.waiting.add(client);

                await Promise.all(
                    [...this.connections]
                        .map(([ clientId, connection ]) => {
                            if (this.waiting.has(connection)) {
                                this.waiting.delete(connection);

                                const playerConnection = this.connections.get(clientId);

                                return playerConnection?.sendPacket(
                                    new ReliablePacket(
                                        playerConnection.getNextNonce(),
                                        [
                                                new JoinedGameMessage(
                                                this.code,
                                                clientId,
                                                this.hostid || SpecialClientId.Nil,
                                                [...this.connections.values()]
                                                    .filter(cl => cl !== connection)
                                                    .map(connection => connection.clientId)
                                            )
                                        ]
                                    )
                                );
                            } else {
                                return Promise.resolve();
                            }
                        })
                );
                
                this.logger.info("%s joined, joining other clients",
                    player);
            } else {
                this.waiting.add(client);
                
                await this.broadcastMessages([], [
                    new JoinGameMessage(
                        this.code,
                        client.clientId,
                        this.hostid || SpecialClientId.Nil
                    )
                ]);

                await client.sendPacket(
                    new ReliablePacket(
                        client.getNextNonce(),
                        [
                            new WaitForHostMessage(
                                this.code,
                                client.clientId
                            )
                        ]
                    )
                );

                this.logger.info("%s joined, waiting for host",
                    player);
            }
            return;
        }

        await client.sendPacket(
            new ReliablePacket(
                client.getNextNonce(),
                [
                    new JoinedGameMessage(
                        this.code,
                        client.clientId,
                        this.host!.id,
                        [...this.connections]
                            .map(([, client]) => client.clientId)
                    ),
                    new AlterGameMessage(
                        this.code,
                        AlterGameTag.ChangePrivacy,
                        this.privacy === "public" ? 1 : 0
                    )
                ]
            )
        );

        await this.broadcastMessages([], [
            new JoinGameMessage(
                this.code,
                client.clientId,
                this.host!.id
            )
        ]);
        
        this.connections.set(client.clientId, client);

        this.logger.info(
            "%s joined the game",
            client
        );
    }

    async handleStart() {
        this.state = GameState.Started;

        await this.broadcastMessages([], [
            new StartGameMessage(this.code)
        ]);
    }

    async handleEnd(reason: GameOverReason) {
        this.waiting.clear();
        this.state = GameState.Ended;

        await this.broadcastMessages([], [
            new EndGameMessage(this.code, reason, false)
        ]);
    }

    /**
     * Send a message into the chat as the server.
     * 
     * @summary
     * If on the left side, the room spawns a new player owned by the room with
     * a player ID of 127 and updates their name and colour and despawns them
     * immediately after sending the message.
     * 
     * If on the right side, for each player the room sets their name and colour
     * and immediately sets them back after sending the message.
     * @param message The message to send.
     * @param options Options for the method.
     * @example
     * ```ts
     * // Tell a player off if they use a bad word.
     * .@EventListener("player.sentchat")
     * onPlayerChat(ev: PlayerChatEvent<Room>) {
     *   const badWords = [ "sprout", "barney" ];
     * 
     *   for (const word of badWords) {
     *     if (ev.chatMessage.includes(word)) {
     *       ev.message.cancel(); // Don't broadcast the message to other players
     *       ev.room.sendChat("<color=red>You used a bad word there, mister.</color>", { target: ev.player });
     *     }
     *   }
     * }
     * ```
     */
     async sendChat(message: string, options: Partial<SendChatOptions> = {}) {
        if (!this.gamedata)
            throw new TypeError("No gamedata spawned.");

        const defaultOptions: SendChatOptions = {
            side: MessageSide.Left,
            target: undefined,
            name: "<color=yellow>[Server]</color>",
            color: Color.Yellow,
            ...options
        };

        if (defaultOptions.side === MessageSide.Left) {
            const writer = HazelWriter.alloc(4 + defaultOptions.name.length + 6);
            const mwriter = writer.begin(127); // Write game data for player Id 127 (max player id)
            mwriter.string(defaultOptions.name);
            mwriter.packed(defaultOptions.color);
            mwriter.upacked(0);
            mwriter.upacked(0);
            mwriter.upacked(0);
            mwriter.byte(0);
            mwriter.uint8(0);
            writer.end();
            const pcNetId = this.getNextNetId();
            const ppNetId = this.getNextNetId();
            const cntNetId = this.getNextNetId();
            await this.broadcast([
                new SpawnMessage(
                    SpawnType.Player,
                    -2,
                    0,
                    [ // Must spawn all components as client doesn't accept spawn if it isn't a full player spawn
                        new ComponentSpawnData( // Player Control
                            pcNetId,
                            Buffer.from("007f", "hex") // isNew=false playerId=127
                        ),
                        new ComponentSpawnData( // Player Physics
                            ppNetId,
                            Buffer.from("", "hex")
                        ),
                        new ComponentSpawnData( // Custom Network Transform
                            cntNetId,
                            Buffer.from("00010000000000000000") // sequenceId=1 position=0,0 velocity=0,0
                        )
                    ]
                ),
                new DataMessage(
                    this.gamedata.netid,
                    writer.buffer
                ),
                new RpcMessage(
                    pcNetId,
                    new SetNameMessage(defaultOptions.name)
                ),
                new RpcMessage(
                    pcNetId,
                    new SetColorMessage(defaultOptions.color)
                ),
                new RpcMessage(
                    pcNetId,
                    new SendChatMessage(message)
                ),
                new DespawnMessage(pcNetId),
                new DespawnMessage(ppNetId),
                new DespawnMessage(cntNetId)
            ], true, defaultOptions.target);
        } else {
            // Super dumb way of doing the same thing for a single player if specified, or all players if one isn't specified
            for (const [ , player ] of (defaultOptions.target ? [[ , defaultOptions.target ]] as [[void, PlayerData]] : this.players)) {
                if (!player.control)
                    continue;

                if (!player.info)
                    continue;

                const writer = HazelWriter.alloc(18);
                const mwriter = writer.begin(player.playerId!); // Write temporary game data for player
                mwriter.string(defaultOptions.name);
                mwriter.packed(defaultOptions.color);
                mwriter.upacked(0);
                mwriter.upacked(0);
                mwriter.upacked(0);
                mwriter.byte(0);
                mwriter.uint8(0);
                writer.end();

                const writer2 = HazelWriter.alloc(18);
                const mwriter2 = writer2.begin(player.playerId!); // Write old game data for player
                mwriter2.string(player.info.name);
                mwriter2.packed(player.info.color);
                mwriter2.upacked(0);
                mwriter2.upacked(0);
                mwriter2.upacked(0);
                mwriter2.byte(0);
                mwriter2.uint8(0);
                writer2.end();
                const oldName = player.info.name;
                const oldColor = player.info.color;
                await this.broadcast([
                    new RpcMessage(
                        player.control.netid,
                        new SetNameMessage(defaultOptions.name)
                    ),
                    new RpcMessage(
                        player.control.netid,
                        new SetColorMessage(defaultOptions.color)
                    ),
                    new DataMessage(
                        this.gamedata.netid,
                        writer.buffer
                    ),
                    new RpcMessage(
                        player.control.netid,
                        new SendChatMessage(message)
                    ),
                    new RpcMessage(
                        player.control.netid,
                        new SetNameMessage(oldName)
                    ),
                    new RpcMessage(
                        player.control.netid,
                        new SetColorMessage(oldColor)
                    ),
                    new DataMessage(
                        this.gamedata.netid,
                        writer2.buffer
                    )
                ], true, defaultOptions.target);
            }
        }
    }
}