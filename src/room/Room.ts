import chalk from "chalk";
import util from "util";
import winston from "winston";

import {
    Color,
    DisconnectReason,
    GameMap,
    GameOverReason,
    GameState,
    LimboStates,
    SpawnType
} from "@skeldjs/constant";

import {
    BaseGameDataMessage,
    BaseRootMessage,
    ComponentSpawnData,
    DataMessage,
    DespawnMessage,
    EndGameMessage,
    GameDataMessage,
    GameDataToMessage,
    GameOptions,
    JoinedGameMessage,
    JoinGameMessage,
    PacketDecoder,
    ReliablePacket,
    RemovePlayerMessage,
    RpcMessage,
    SendChatMessage,
    SetColorMessage,
    SetNameMessage,
    SpawnMessage,
    StartGameMessage,
    WaitForHostMessage
} from "@skeldjs/protocol";

import { BasicEvent, EventEmitter } from "@skeldjs/events";
import { HazelReader, HazelWriter, sleep } from "@skeldjs/util";

import { Connection } from "../Connection";
import { Player, PlayerEvents } from "./Player";
import { Worker } from "../Worker";
import { GameCode } from "./GameCode";
import { Component } from "./Component";
import { PlayerInfo } from "./util/PlayerInfo";
import { PlayerStore } from "./util/PlayerStore";
import { GameData } from "./components/GameData";
import { PlayerControl } from "./components/PlayerControl";
import { PlayerPhysics } from "./components/PlayerPhysics";
import { CustomNetworkTransform } from "./components/CustomNetworkTransform";
import { ComponentStore } from "./util/ComponentStore";
import { VoteKicks } from "./util/VoteKicks";
import { VoteBanSystem } from "./components/VoteBanSystem";
import { VorpalConsole } from "../util/VorpalConsoleTransport";

enum SpecialClientId {
    Nil = 2 ** 31 - 1,
    Server = 2 ** 31 - 2,
    Temp = 2 ** 31 - 3
}

const logMaps = {
    [GameMap.TheSkeld]: "the skeld",
    [GameMap.MiraHQ]: "mira",
    [GameMap.Polus]: "polus",
    [GameMap.AprilFoolsTheSkeld]: "skeld april fools",
    [GameMap.Airship]: "airship"
}

const spawnPrefabs: Record<number, ComponentCtr[]> = {
    [SpawnType.GameData]: [GameData, VoteBanSystem],
    [SpawnType.Player]: [PlayerControl, PlayerPhysics, CustomNetworkTransform]
}

export enum MessageSide {
    Left,
    Right
}

/**
 * Options regarding sending a chat message into the room as the server, see
 * {@link Room.sendChat}
 */
export interface SendChatOptions {
    /**
     * The side of the chat box for the message to appear on for each player.
     * @example
     * ```ts
     * room.sendChat("Slide to the left", {
     *   side: MessageSide.Left
     * });
     * 
     * room.sendChat("Slide to the right", {
     *   side: MessageSide.Right
     * });
     * ```
     */
    side: MessageSide;
    /**
     * The player to send the message to, if omitted, sends to all players.
     * @example
     * ```ts
     * // Alert the host of a hacker
     * .@EventListener("anticheat.potential")
     * onPotentialCheater(ev: AnticheatPotentialEvent) {
     *   if (!ev.player.info)
     *     return;
     * 
     *   ev.room.sendChat("<color=red>Potential cheater detected: " + ev.player.info.name + "</color>", {
     *     target: ev.room.players.host
     *   });
     * }
     * ```
     */
    target: Player|undefined;
    /**
     * The name of the player to appear as.
     * @example
     * ```ts
     * ev.room.sendChat("i am the impostor", {
     *   name: "<color=red>The Impostor</color>",
     *   color: Color.Red
     * });
     * ```
     */
    name: string;
    /**
     * The color of the player to appear as.
     * @example
     * ```ts
     * ev.room.sendChat("i am the impostor", {
     *   name: "<color=red>The Impostor</color>",
     *   color: Color.Red
     * });
     * ```
     */
    color: Color;
}

export interface RoomComponentCtr {
    new(
        room: Room,
        owner: Room,
        netid: number
    ): Component 
}

export interface PlayerComponentCtr {
    new(
        room: Room,
        owner: Player,
        netid: number
    ): Component 
}

export type ComponentCtr = RoomComponentCtr|PlayerComponentCtr;
export type RoomEvents = PlayerEvents;

export class Room extends EventEmitter<RoomEvents> {
    /**
     * This room's console logger.
     */
    logger: winston.Logger;

    /**
     * The packet decoder for this room.
     */
    decoder: PacketDecoder<Player>;

    /**
     * The components spawned for this room.
     */
    components: ComponentStore;
    
    /**
     * The players connected to this room.
     */
    players: PlayerStore;
    
    /**
     * All IP addresses banned from this room.
     */
    bans: Set<string>;

    /**
     * The game code of this room as an integer.
     */
    code: GameCode;

    /**
     * The current game state for this room.
     */
    state: GameState;

    /**
     * The client ID of the host of this room.
     */
    hostid?: number;

    /**
     * A stream of gamedata messages that are sent and flushed every {@link Room.FixedUpdate}. (50 times per second)
     */
    gamedataStream: BaseGameDataMessage[];

    /**
     * General information about players.
     */
    playerInfo: Map<number, PlayerInfo>;

    /**
     * Information about which players have voted to kick other players.
     */
    voteKicks: VoteKicks;

    private lastFixedUpdateTime: number;
    private incrNetId: number;

    constructor(
        public readonly worker: Worker,
        public readonly options: GameOptions
    ) {
        super();

        this.state = GameState.NotStarted;

        this.logger = winston.createLogger({
            transports: [
                new VorpalConsole(this.worker.vorpal, {
                    format: winston.format.combine(
                        winston.format.splat(),
                        winston.format.colorize(),
                        winston.format.printf(info => {
                            return `[${util.inspect(this.code, false, 0, true)}] ${info.level}: ${info.message}`;
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

        this.decoder = new PacketDecoder;
        this.components = new ComponentStore(this);
        this.players = new PlayerStore(this);
        this.voteKicks = new VoteKicks(this);
        this.playerInfo = new Map;
        this.bans = new Set;

        this.code = new GameCode(this, 32);
        this.hostid = 0;
        
        this.gamedataStream = [];

        this.lastFixedUpdateTime = Date.now();
        this.incrNetId = 0;

        setInterval(() => {
            const deltaTime = Date.now() - this.lastFixedUpdateTime;
            this.lastFixedUpdateTime = Date.now();
            this.FixedUpdate(deltaTime);
        }, 1000 / 50);

        this.decoder.on(DataMessage, (message, direction, player) => {
            const component = this.components.get(message.netid);

            if (!component)
                return;

            const dataReader = HazelReader.from(message.data);
            component.Deserialize(dataReader, false);
        });

        this.decoder.on(RpcMessage, async (message, direction, player) => {
            const component = this.components.get(message.netid);

            if (!component)
                return;

            await component.HandleRpc(message.data);
        });

        this.decoder.on(SpawnMessage, (message, direction, player) => {
            const owner = message.ownerid === -2 ? this : this.players.get(message.ownerid);

            if (!owner)
                return;
            
            if (owner instanceof Player) {
                owner.limboState = LimboStates.NotLimbo;
            }
            
            for (let i = 0; i < message.components.length; i++) {
                const mComponent = message.components[i];

                const componentCtr = spawnPrefabs[message.spawnType]?.[i];

                if (mComponent.netid > this.incrNetId) {
                    this.incrNetId = mComponent.netid;
                }

                if (!componentCtr) {
                    this.logger.warn("Unhandled spawn type: %s %s",
                        SpawnType[message.spawnType] || message.spawnType, chalk.grey("(idx. " + i + ")"));
                    return;
                }

                const spawnedComponent = new componentCtr(this, owner as Room&Player, mComponent.netid);
                this.components.addComponent(message.spawnType, i, spawnedComponent);

                const dataReader = HazelReader.from(mComponent.data);
                spawnedComponent.Deserialize(dataReader, true);

            }

            //this.logger.info("Spawn: %s %s %s",
            //    SpawnType[message.spawnType] || message.spawnType, chalk.grey("(" + message.components.length + " components)"), owner);
        });

        this.decoder.on(DespawnMessage, (message, direction, player) => {
            const component = this.components.get(message.netid);
            if (!component)
                return;
            this.components.removeComponent(component);
        });

        this.decoder.on(StartGameMessage, (message, direction, player) => {
            this.state = GameState.Started;

            this.logger.info("Game started");
        });

        this.decoder.on(EndGameMessage, (message, direction, player) => {
            this.state = GameState.Ended;
            this.players.clear();
            
            this.logger.info("Game ended: %s",
                GameOverReason[message.reason]);
        });

        this.decoder.on(SendChatMessage, (message, direction, player) => {
            this.logger.info("%s sent chat message: %s",
                player, chalk.cyan(message.message));
        });

        this.on("player.setname", setname => {
            if (setname.oldName) {
                this.logger.info("%s changed their name from %s to %s",
                    setname.player, setname.oldName, setname.name);
            } else {
                this.logger.info("%s set their name to %s",
                    setname.player, setname.name);
            }
        });
    }

    [Symbol.for("nodejs.util.inspect.custom")]() {
        let paren = logMaps[this.options.map] + ", "
            + this.players.size + "/" + this.options.maxPlayers + " players";

        return util.inspect(this.code, false, 0, true) + " " + chalk.grey("(" + paren + ")");
    }
    
    async emit<Event extends RoomEvents[keyof RoomEvents]>(
        event: Event
    ): Promise<Event>;
    async emit<Event extends BasicEvent>(event: Event): Promise<Event>;
    async emit<Event extends BasicEvent>(event: Event): Promise<Event> {
        await this.worker.emit(event);

        return super.emit(event);
    }

    getNextNetId() {
        this.incrNetId++;
        return this.incrNetId;
    }

    /**
     * Call a Unity [FixedUpdate](https://docs.unity3d.com/ScriptReference/MonoBehaviour.FixedUpdate.html)-like
     * method on all components.
     * 
     * Also flushes {@link Room.gamedataStream} and broadcasts to all players.
     * @param deltaTime 
     */
    async FixedUpdate(deltaTime: number) {
        for (const [ netid, component ] of this.components) {
            const writer = HazelWriter.alloc(512);
            if (component.Serialize(writer, false)) {
                writer.realloc(writer.cursor);
                this.gamedataStream.push(
                    new DataMessage(netid, writer.buffer)
                );
            }
        }
        if (this.gamedataStream.length) {
            await this.broadcastMessages(this.gamedataStream);
            this.gamedataStream = [];
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
        include?: Player[],
        exclude?: Player[]
    ) {
        const playersToBroadcast = include || [...this.players.values()];
        const playersToExclude = new Set(exclude);
        const promises: Promise<void>[] = [];

        for (const player of playersToBroadcast) {
            if (playersToExclude.has(player))
                continue;

            const messages = [
                ...(gamedata.length ?
                    [
                        include
                            ? new GameDataToMessage(
                                this.code.id,
                                player.clientId,
                                gamedata
                            )
                            : new GameDataMessage(
                                this.code.id,
                                gamedata
                            )
                    ]
                    : []),
                ...payload
            ] as BaseRootMessage[];

            promises.push(
                player.connection.sendPacket(
                    new ReliablePacket(
                        player.connection.getNextNonce(),
                        messages
                    )
                )
            );
        }

        await Promise.all(promises);
    }

    /**
     * Destroy this room, broadcasting a [RemoveGame](https://github.com/codyphobe/among-us-protocol/blob/master/02_root_message_types/03_removegame.md)
     * message to all clients and removing itself from the server.
     * @param reason Reason to tell players why the room was destroyed.
     */
    async destroy(reason = DisconnectReason.ServerRequest) {
        this.worker.logger.info("Destroyed %s", this);
        
        await Promise.all(
            [...this.players].map(([, player]) => {
                return player.connection.leaveRoom(reason);
            })
        );

        this.worker.rooms.delete(this.code.id);
    }

    /**
     * Handle a client attempting to join this room.
     * 
     * See https://github.com/codyphobe/among-us-protocol/blob/master/02_root_message_types/01_joingame.md
     * for more information.
     * @param connection The client that is joining.
     */
    async handleJoin(connection: Connection) {
        if (this.players.has(connection.clientId))
            throw new Error("Client is already connected to the room.");
        
        const player = new Player(connection, this);

        connection.room = this;
        this.players.set(connection.clientId, player);
        
        if (this.players.size === 1) {
            await this.setHost(player, false);
        }

        // todo: handle wait for host. https://github.com/codyphobe/among-us-protocol/blob/master/02_root_message_types/01_joingame.md#client-to-server
        if (this.state === GameState.Ended) {
            if (connection.clientId === this.hostid) {
                this.state = GameState.NotStarted;
                player.limboState = LimboStates.WaitingForHost;

                await Promise.all(
                    [...this.players]
                        .map(([ clientId, player ]) => {
                            if (player.limboState === LimboStates.WaitingForHost) {
                                player.limboState = LimboStates.NotLimbo;

                                return player.connection.sendPacket(
                                    new ReliablePacket(
                                        player.connection.getNextNonce(),
                                        [
                                                new JoinedGameMessage(
                                                this.code.id,
                                                clientId,
                                                this.hostid || SpecialClientId.Nil,
                                                [...this.players.values()]
                                                    .filter(pl => pl !== player)
                                                    .map(player => player.clientId)
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
                player.limboState = LimboStates.WaitingForHost;
                
                await this.broadcastMessages([], [
                    new JoinGameMessage(
                        this.code.id,
                        connection.clientId,
                        this.hostid || SpecialClientId.Nil
                    )
                ], undefined, [player]);

                await connection.sendPacket(
                    new ReliablePacket(
                        connection.getNextNonce(),
                        [
                            new WaitForHostMessage(
                                this.code.id,
                                connection.clientId
                            )
                        ]
                    )
                );

                this.logger.info("%s joined, waiting for host",
                    player);
            }
            return;
        }

        await this.broadcastMessages([], [
            new JoinGameMessage(
                this.code.id,
                connection.clientId,
                this.hostid || SpecialClientId.Nil
            )
        ], undefined, [player]);

        await connection.sendPacket(
            new ReliablePacket(
                connection.getNextNonce(),
                [
                    new JoinedGameMessage(
                        this.code.networkName,
                        connection.clientId,
                        this.hostid || SpecialClientId.Nil,
                        [...this.players.values()]
                            .filter(pl => pl !== player)
                            .map(player => player.clientId)
                    )
                ]
            )
        );

        this.logger.info("%s joined",
            player);
    }

    /**
     * Handling a client leaving or being kicked from the room.
     * @param connection The client that is leaving.
     * @param reason The reason for why the client is leaving.
     */
    async handleLeave(connection: Connection, reason: DisconnectReason) {
        if (!this.players.has(connection.clientId))
            throw new Error("Client is not connected to the room.");

        await this.broadcastMessages([], [
            new RemovePlayerMessage(
                this.code.id,
                connection.clientId,
                reason,
                connection.clientId
            )
        ]);

        this.players.delete(connection.clientId);
        connection.room = undefined;

        if (connection.clientId === this.hostid) {
            if (this.players.size) {
                await this.setHost(
                    [...this.players.values()][0],
                    false
                );
            } else {
                await this.setHost(undefined, false);
            }
        }
    }

    /**
     * Change the host of the room.
     * @param host The client to set as host.
     * @param doUpdate Whether to immediately update the host for all clients.
     * @example
     * ```ts
     * // Pick a random host
     * const playersArr = [...room.players];
     * if (playersArr.length) {
     *   const random = ~~(Math.random() * playersArr.length);
     *   room.setHost(random);
     * }
     * ```
     */
    async setHost(host: Player|undefined, doUpdate: boolean = true) {
        if (host && !this.players.get(host.clientId))
            throw new Error("Tried to set the host to a client that is not in the room.");

        if (doUpdate) {
            await this.broadcastMessages([], [
                new JoinGameMessage(
                    this.code.id,
                    SpecialClientId.Nil,
                    host ? host.clientId : SpecialClientId.Nil
                ),
                new RemovePlayerMessage(
                    this.code.id,
                    SpecialClientId.Nil,
                    DisconnectReason.None,
                    host ? host.clientId : SpecialClientId.Nil
                )
            ]);
        }

        this.hostid = host?.clientId || undefined;
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
     * .@EventListener("player.chat")
     * onPlayerChat(ev: PlayerChatEvent) {
     *   const badWords = [ "sprout", "barney" ];
     * 
     *   for (const word of badWords) {
     *     if (ev.message.includes(word)) {
     *       ev.rpc.cancel(); // Don't broadcast the message to other players
     *       ev.room.sendChat("<color=red>You used a bad word there, mister.</color>", { target: ev.player });
     *     }
     *   }
     * }
     * ```
     */
    async sendChat(message: string, options: Partial<SendChatOptions> = {}) {
        if (!this.components.gameData)
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
            await this.broadcastMessages([
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
                    this.components.gameData.netid,
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
            ], [], defaultOptions.target ? [defaultOptions.target]: undefined);
        } else {
            // Super dumb way of doing the same thing for a single player if specified, or all players if one isn't specified
            for (const [ , player ] of (defaultOptions.target ? [[ , defaultOptions.target ]] as [[void, Player]] : this.players)) {
                if (!player.components.control)
                    continue;

                if (!player.info)
                    continue;

                const writer = HazelWriter.alloc(18);
                const mwriter = writer.begin(player.playerId); // Write game data for player
                mwriter.string(defaultOptions.name);
                mwriter.packed(defaultOptions.color);
                mwriter.upacked(0);
                mwriter.upacked(0);
                mwriter.upacked(0);
                mwriter.byte(0);
                mwriter.uint8(0);
                writer.end();
                const oldName = player.info.name;
                const oldColor = player.info.color;
                await this.broadcastMessages([
                    new DataMessage(
                        this.components.gameData.netid,
                        writer.buffer
                    ),
                    new RpcMessage(
                        player.components.control.netid,
                        new SetNameMessage(defaultOptions.name)
                    ),
                    new RpcMessage(
                        player.components.control.netid,
                        new SetColorMessage(defaultOptions.color)
                    ),
                    new RpcMessage(
                        player.components.control.netid,
                        new SendChatMessage(message)
                    ),
                    new RpcMessage(
                        player.components.control.netid,
                        new SetNameMessage(oldName)
                    ),
                    new RpcMessage(
                        player.components.control.netid,
                        new SetColorMessage(oldColor)
                    )
                ], [], defaultOptions.target ? [defaultOptions.target]: undefined);
            }
        }
    }
}