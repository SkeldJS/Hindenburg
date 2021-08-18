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
    MessageDirection,
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

import { Code2Int, HazelWriter, sleep } from "@skeldjs/util";

import { SendChatOptions, MessageSide } from "./interfaces";

import { Connection } from "./Connection";
import { Worker } from "./Worker";

import {
    ClientBroadcastEvent,
    RoomBeforeDestroyEvent,
    RoomDestroyEvent,
    RoomGameEndEvent,
    RoomGameStartEvent
} from "./api";

import { fmtCode } from "./util/fmtCode";
import { fmtLogFormat } from "./util/fmtLogFormat";
import { RoomsConfig } from "./interfaces";
import { CommandCallError, ChatCommandContext } from "./handlers";
import { Perspective, PresetFilter } from "./Perspective";

(PlayerData.prototype as any)[Symbol.for("nodejs.util.inspect.custom")] = function (this: PlayerData<BaseRoom>) {
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
};

export enum SpecialClientId {
    Nil = 2 ** 31 - 1,
    Server = 2 ** 31 - 2,
    Temp = 2 ** 31 - 3
}

export const logMaps = {
    [GameMap.TheSkeld]: "the skeld",
    [GameMap.MiraHQ]: "mira hq",
    [GameMap.Polus]: "polus",
    [GameMap.AprilFoolsTheSkeld]: "skeld april fools",
    [GameMap.Airship]: "airship"
};

export type RoomEvents = HostableEvents<BaseRoom> & ExtractEventTypes<[
    ClientBroadcastEvent,
    RoomBeforeDestroyEvent,
    RoomDestroyEvent,
    RoomGameEndEvent,
    RoomGameStartEvent
]>;

export class BaseRoom extends Hostable<RoomEvents> {
    createdAt: number;
    connections: Map<number, Connection>;
    waiting: Set<Connection>;
    
    playerPerspectives!: Map<number, Perspective>;
    activePerspectives!: Perspective[];

    /**
     * This room's console logger.
     */
    logger!: winston.Logger;

    /**
     * All IP addresses banned from this room.
     */
    bans: Set<string>;

    state: GameState;

    constructor(
        public readonly worker: Worker,
        public readonly config: RoomsConfig,
        settings: GameSettings
    ) {
        super({ doFixedUpdate: true });

        this.createdAt = Date.now();
        this.connections = new Map;
        this.waiting = new Set;

        this.decoder.types = worker.decoder.types;

        this.bans = new Set;
        this.settings = settings;

        this.state = GameState.NotStarted;

        this.decoder.on(EndGameMessage, message => {
            this.handleEnd(message.reason);
        });

        this.decoder.on(StartGameMessage, () => {
            this.handleStart();
        });

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
            // todo: log settings diff
            this.logger.info("Updated game settings, use `ls settings %s`",
                fmtCode(this.code));

            if (this.config.enforceSettings) {
                ev.setSettings(this.config.enforceSettings);
            }
        });

        this.on("room.gamestart", () => {
            this.logger.info("Game started");
        });

        this.on("room.gameend", ev => {
            this.logger.info("Game ended: %s", GameOverReason[ev.reason]);

            setImmediate(() => {
                this.logger.info("Clearing connections for clients to re-join");
                this.connections.clear();
            });
        });
    }

    async emit<Event extends RoomEvents[keyof RoomEvents]>(
        event: Event
    ): Promise<Event>;
    async emit<Event extends BasicEvent>(event: Event): Promise<Event>;
    async emit<Event extends BasicEvent>(event: Event): Promise<Event> {
        const ev = await this.worker.emit(event);

        if ((ev as any).canceled || (ev as any).reverted) {
            return ev;
        }

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

        return chalk.yellow(fmtCode(this.code))
            + (paren ? " " + chalk.grey("(" + paren + ")") : "");
    }

    get host() {
        return this.players.get(this.actingHostId);
    }

    get amhost() {
        return this.config.serverAsHost;
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

        const stream = this.stream;
        this.stream = [];
        if (!ev.canceled && stream.length) {
            await this.broadcast(stream);
        }
    }
    
    /**
     * Broadcast [GameData messages](https://github.com/codyphobe/among-us-protocol/blob/master/03_gamedata_and_gamedatato_message_types/README.md)
     * and root messages to all or some connections.
     * 
     * Sends GameDataTo if a filter is applied with the include parameter.
     * @param gamedata The [GameData messages](https://github.com/codyphobe/among-us-protocol/blob/master/03_gamedata_and_gamedatato_message_types/README.md)
     * to send.
     * @param payloads The [Root messages](https://github.com/codyphobe/among-us-protocol/blob/master/02_root_message_types/README.md)
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
        payloads: BaseRootMessage[] = [],
        include?: Connection[],
        exclude?: Connection[],
        reliable = true
    ) {
        if (!gamedata.length && !payloads.length)
            return;

        const clientsToBroadcast = include || [...this.connections.values()];
        const clientsToExclude = new Set(exclude);
        const promises: Promise<void>[] = [];

        for (let i = 0; i < clientsToBroadcast.length; i++) {
            const connection = clientsToBroadcast[i];

            if (clientsToExclude.has(connection))
                continue;
                
            if (this.playerPerspectives?.has(connection.clientId))
                continue;

            const ev = await this.emit(
                new ClientBroadcastEvent(
                    this,
                    connection,
                    gamedata,
                    payloads
                )
            );

            if (!ev.canceled) {
                const messages = [
                    ...(ev.alteredGameData.length
                        ? [
                            include
                                ? new GameDataToMessage(
                                    this.code,
                                    connection.clientId,
                                    ev.alteredGameData
                                )
                                : new GameDataMessage(
                                    this.code,
                                    ev.alteredGameData
                                )
                        ] : []
                    ),
                    ...payloads
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
        }

        await Promise.all(promises);
    }

    async broadcast(
        messages: BaseGameDataMessage[],
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        reliable = true,
        recipient: PlayerData | undefined = undefined,
        payloads: BaseRootMessage[] = []
    ) {
        const recipientConnection = recipient
            ? this.connections.get(recipient.id)
            : undefined;
            
        for (let i = 0; i < this.activePerspectives.length; i++) {
            const activePerspective = this.activePerspectives[i];

            const messagesNotCanceled = [];
            const payloadsNotCanceled = [];
            for (let i = 0; i < messages.length; i++) {
                const child = messages[i];

                (child as any)._canceled = false; // child._canceled is private
                await activePerspective.incomingFilter.emitDecoded(child, MessageDirection.Serverbound, undefined);

                if (child.canceled) {
                    (child as any)._canceled = false;
                    continue;
                }
                    
                await activePerspective.decoder.emitDecoded(child, MessageDirection.Serverbound, undefined);

                if (child.canceled) {
                    (child as any)._canceled = false;
                    continue;
                }
                
                messagesNotCanceled.push(child);
            }

            for (let i = 0; i < payloads.length; i++) {
                const child = payloads[i];

                (child as any)._canceled = false; // child._canceled is private
                await activePerspective.incomingFilter.emitDecoded(child, MessageDirection.Serverbound, undefined);

                if (child.canceled) {
                    (child as any)._canceled = false;
                    continue;
                }
                    
                await activePerspective.decoder.emitDecoded(child, MessageDirection.Serverbound, undefined);

                if (child.canceled) {
                    (child as any)._canceled = false;
                    continue;
                }
                
                payloadsNotCanceled.push(child);
            }

            if (messagesNotCanceled.length || payloadsNotCanceled.length) {
                await activePerspective.broadcastMessages(messagesNotCanceled, payloadsNotCanceled, recipientConnection ? [ recipientConnection ] : undefined, undefined, true);
            }
        }
            
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

    async updateHost(hostId: number, recipient?: Connection) {
        await this.broadcastMessages([], [
            new JoinGameMessage(
                this.code,
                SpecialClientId.Temp,
                hostId
            ),
            new RemovePlayerMessage(
                this.code,
                SpecialClientId.Temp,
                DisconnectReason.None,
                hostId
            )
        ], recipient ? [ recipient ] : undefined);
    }

    async setHost(player: PlayerData) {
        const remote = this.connections.get(player.id);

        const before = this.hostid;
        const resolvedId = this.resolvePlayerClientID(player);

        if (!resolvedId)
            return;

        if (this.config.serverAsHost) {
            this.hostid = SpecialClientId.Server;
            this.actingHostId = resolvedId;
        } else {
            this.hostid = resolvedId;
            this.actingHostId = this.hostid;
        }

        if (this.amhost) {
            if (!this.lobbybehaviour) {
                this.spawnPrefab(SpawnType.LobbyBehaviour, -2);
            }
            if (!this.gamedata) {
                this.spawnPrefab(SpawnType.GameData, -2);
            }
        }

        if (before !== this.hostid && this.host) {
            await this.host.emit(new PlayerSetHostEvent(this, this.host));
        }

        if (!remote)
            return;

        if (this.state === GameState.Ended && this.waiting.has(remote)) {
            this.state = GameState.NotStarted;
            await this._joinOtherClients();
        }
    }

    async handleRemoteLeave(client: Connection, reason: DisconnectReason = DisconnectReason.None) {
        await this.handleLeave(client.clientId);

        this.waiting.delete(client);
        this.connections.delete(client.clientId);

        if (this.players.size === 0) {
            await this.destroy();
            return;
        }

        if (client.clientId === this.hostid) {
            if (this.connections.size === 0) {
                await this.setHost([...this.players.values()][0]);
            } else {
                const connection = [...this.connections.values()][0];
                const player = this.players.get(connection.clientId);

                if (player) {
                    await this.setHost(player);
                }
            }
        }

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
        if (this.connections.get(client.clientId))
            return;

        const player = await this.handleJoin(client.clientId) || this.players.get(client.clientId);

        if (!player)
            return;

        if (!this.host)
            await this.setHost(player);

        client.room = this;
        if (this.state === GameState.Ended) {
            if (client.clientId === this.hostid) {
                this.state = GameState.NotStarted;
                this.waiting.add(client);
                this.connections.set(client.clientId, client);
                
                this.logger.info("%s joined, joining other clients..",
                    player);
                    
                await this.broadcastMessages([], [
                    new JoinGameMessage(
                        this.code,
                        client.clientId,
                        this.hostid
                    )
                ], undefined, [ client ]);

                await this._joinOtherClients();
            } else {
                this.waiting.add(client);
                this.connections.set(client.clientId, client);
                
                await this.broadcastMessages([], [
                    new JoinGameMessage(
                        this.code,
                        client.clientId,
                        this.hostid
                    )
                ], undefined, [ client ]);

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

    private async _joinOtherClients() {
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
                                        this.hostid,
                                        [...this.connections.values()]  
                                            .reduce<number[]>((prev, cur) => {
                                                if (cur !== connection) {
                                                    prev.push(cur.clientId);
                                                }
                                                return prev;
                                            }, [])
                                    )
                                ]
                            )
                        ) || Promise.resolve();
                    } else {
                        return Promise.resolve();
                    }
                })
        );

        this.waiting.clear();
    }

    async handleStart() {
        this.state = GameState.Started;

        const ev = await this.emit(new RoomGameStartEvent(this));

        if (ev.canceled) {
            this.state = GameState.NotStarted;
            return;
        }

        await this.broadcastMessages([], [
            new StartGameMessage(this.code)
        ]);
    }

    async handleEnd(reason: GameOverReason) {
        const waiting = this.waiting;
        this.waiting = new Set;
        this.state = GameState.Ended;
        
        const ev = await this.emit(new RoomGameEndEvent(this, reason));

        if (ev.canceled) {
            this.waiting = waiting;
            this.state = GameState.Started;
            return;
        }

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
            await this.broadcast([], true, defaultOptions.target, [
                new JoinGameMessage(
                    this.code,
                    SpecialClientId.Temp,
                    this.hostid  
                )
            ]);
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
            await sleep(25);
            await this.broadcast([], true, defaultOptions.target, [
                new RemovePlayerMessage(
                    this.code,
                    SpecialClientId.Temp,
                    DisconnectReason.None,
                    this.hostid
                )
            ]);
        } else {
            // Super dumb way of doing the same thing for a single player if specified, or all players if one isn't specified
            for (const [ , player ] of (defaultOptions.target ? [[ undefined, defaultOptions.target ]] as [[void, PlayerData]] : this.players)) {
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

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    createPerspective(players: PlayerData|PlayerData[], filters: PresetFilter[]): Perspective {
        throw new TypeError("Method not implemented.");
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async broadcastToPerspectives(connection: Connection, messages: BaseGameDataMessage[], reliable: boolean) {
        throw new TypeError("Method not implemented.");
    }
}