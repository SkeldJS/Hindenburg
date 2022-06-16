import chalk from "chalk";

import {
    AlterGameTag,
    Color,
    DisconnectReason,
    GameMap,
    GameOverReason,
    GameState,
    Hat,
    Platform,
    Skin,
    SpawnType,
    Visor
} from "@skeldjs/constant";

import {
    AlterGameMessage,
    BaseGameDataMessage,
    BaseRootMessage,
    DataMessage,
    EndGameMessage,
    GameDataMessage,
    GameDataToMessage,
    GameSettings,
    HostGameMessage,
    JoinedGameMessage,
    JoinGameMessage,
    MessageDirection,
    PlatformSpecificData,
    PlayerJoinData,
    ReliablePacket,
    RemoveGameMessage,
    RemovePlayerMessage,
    RpcMessage,
    SendChatMessage,
    SetColorMessage,
    SetHatMessage,
    SetNameMessage,
    SetSkinMessage,
    SetVisorMessage,
    StartGameMessage,
    UnreliablePacket,
    WaitForHostMessage
} from "@skeldjs/protocol";

import {
    CustomNetworkTransform,
    EndGameIntent,
    HostableEvents,
    Networkable,
    PlayerData,
    PlayerDataResolvable,
    PlayerJoinEvent,
    PlayerSetHostEvent,
    RoomEndGameIntentEvent,
    RoomFixedUpdateEvent
} from "@skeldjs/core";

import { BasicEvent, ExtractEventTypes } from "@skeldjs/events";
import { GameCode, HazelWriter, sleep, Vector2 } from "@skeldjs/util";
import { SkeldjsStateManager } from "@skeldjs/state";

import {
    BaseReactorRpcMessage,
    ClientLeaveEvent,
    ClientBroadcastEvent,
    RoomBeforeDestroyEvent,
    RoomCreateEvent,
    RoomDestroyEvent,
    RoomGameEndEvent,
    RoomGameStartEvent,
    RoomSelectHostEvent
} from "../api";

import {
    SendChatOptions,
    MessageSide,
    RoomsConfig
} from "../interfaces";

import {
    CommandCallError,
    ChatCommandContext,
    RoomPlugin,
    ChatCommandHandler,
    WorkerPlugin,
    LoadedPlugin
} from "../handlers";

import { fmtCode } from "../util/fmtCode";
import { fmtLogFormat } from "../util/fmtLogFormat";
import { Logger } from "../logger";

import { Connection, logLanguages, logPlatforms } from "./Connection";
import { Worker } from "./Worker";
import { Perspective, PresetFilter } from "./Perspective";

Object.defineProperty(PlayerData.prototype, Symbol.for("nodejs.util.inspect.custom"), {
    value(this: PlayerData<BaseRoom>) {
        const connection = this.room.connections.get(this.clientId);

        const isHost = this.room.hostId === this.clientId;
        const isActingHost = !isHost && this.room.actingHostsEnabled && this.room.actingHostIds.has(this.clientId);

        const paren = fmtLogFormat(
            this.room.worker.config.logging.players?.format || ["id", "ping", "ishost"],
            {
                id: this.clientId,
                ping: connection?.roundTripPing,
                mods: connection ? connection.numMods + " mod" + (connection.numMods === 1 ? "" : "s") : undefined,
                level: connection ? "level " + connection.playerLevel : undefined,
                ishost: isHost ? "host" : isActingHost ? "acting host" : undefined,
                platform: connection ? (logPlatforms as any)[connection.platform.platformTag] : undefined,
                language: connection ? (logLanguages as any)[connection.language] : undefined
            }
        );

        return chalk.blue(this.username || "<No Name>")
            + (paren ? " " + chalk.grey("(" + paren + ")") : "");
    }
});

Object.defineProperty(PlayerData.prototype, "isHost", {
    get(this: PlayerData<BaseRoom>) {
        return this.room.hostId === this.clientId || (this.room.actingHostsEnabled && this.room.actingHostIds.has(this.clientId));
    }
});

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
    ClientLeaveEvent,
    RoomBeforeDestroyEvent,
    RoomCreateEvent,
    RoomDestroyEvent,
    RoomGameEndEvent,
    RoomGameStartEvent,
    RoomSelectHostEvent
]>;

const _movementTick = Symbol("_movementTick");

export class BaseRoom extends SkeldjsStateManager<RoomEvents> {
    /**
     * The unix (milliseconds) timestamp. that the room was created.
     */
    createdAt: number;

    private playerJoinedFlag: boolean;
    /**
     * All connections in the room, mapped by client ID to connection object.
     */
    connections: Map<number, Connection>;
    /**
     * The connections/players that are waiting for the host to join back.
     */
    waitingForHost: Set<Connection>;
    /**
     * Player perspectives for each player, mapped by clientId to perspective object.
     */
    playerPerspectives: Map<number, Perspective>;
    /**
     * An array of every player perspective created in the room.
     */
    activePerspectives: Perspective[];
    /**
     * Whether or not acting hosts are enabled on this room.
     */
    actingHostsEnabled: boolean;
    /**
     * The client IDs of every acting host in the room.
     */
    actingHostIds: Set<number>;
    /**
     * This room's console logger.
     */
    logger!: Logger;
    /**
     * All IP addresses banned from this room.
     */
    bannedAddresses: Set<string>;
    /**
     * Player that the server is waiting to finish joining before resetting all
     * acting hosts back.
     */
    actingHostWaitingFor: PlayerData|undefined;
    /**
     * All plugins loaded and scoped to the worker when this room was created, mapped by plugin id to worker plugin object.
     */
    workerPlugins: Map<string, LoadedPlugin<typeof WorkerPlugin>>;
    /**
     * All plugins loaded and scoped to the room, mapped by plugin id to room plugin object.
     */
    loadedPlugins: Map<string, LoadedPlugin<typeof RoomPlugin>>;
    /**
     * All reactor rpc handlers in the room, mapped by reactor message to an array of handlers for that message.
     */
    reactorRpcHandlers: Map<typeof BaseReactorRpcMessage, ((component: Networkable, rpc: BaseReactorRpcMessage) => any)[]>;
    /**
     * All reactor rpcs registered on the room, mapped by modId:reactorTag to the reactor rpc class.
     */
    reactorRpcs: Map<`${string}:${number}`, typeof BaseReactorRpcMessage>;
    /**
     * The chat command handler in the room.
     */
    chatCommandHandler: ChatCommandHandler;

    private roomNameOverride?: string;

    constructor(
        /**
         * The worker that instantiated this object.
         */
        public readonly worker: Worker,
        /**
         * The config for the room, the worker uses the worker's {@link HindenburgConfig.rooms} config to initialise it as.
         */
        public readonly config: RoomsConfig,
        /**
         * The game settings for the room.
         */
        settings: GameSettings
    ) {
        super({ doFixedUpdate: true });

        this.playerPerspectives = new Map;
        this.activePerspectives = [];

        this.actingHostsEnabled = true;
        this.actingHostIds = new Set;

        this.createdAt = Date.now();

        this.playerJoinedFlag = false;

        this.connections = new Map;
        this.waitingForHost = new Set;

        this.decoder.types = worker.decoder.types;

        this.bannedAddresses = new Set;
        this.settings = settings;

        this.gameState = GameState.NotStarted;
        this.actingHostWaitingFor = undefined;

        this.workerPlugins = new Map;
        this.loadedPlugins = new Map;
        this.reactorRpcHandlers = new Map;
        this.reactorRpcs = new Map;
        this.chatCommandHandler = new ChatCommandHandler(this);

        this.hostId = this.config.serverAsHost
            ? SpecialClientId.Server
            : 0;

        this.decoder.on(EndGameMessage, message => {
            this.handleEnd(message.reason);
        });

        this.decoder.on(StartGameMessage, async () => {
            this.handleStart();
        });

        this.on("player.setname", async ev => {
            if (ev.oldName) {
                this.logger.info("%s changed their name from %s to %s",
                    ev.player, ev.oldName, ev.newName);
            } else {
                this.logger.info("%s set their name to %s",
                    ev.player, ev.newName);
            }
        });

        this.on("player.setnameplate", async ev => {
            if (this.actingHostWaitingFor === ev.player) {
                if (this.actingHostsEnabled) {
                    for (const actingHostId of this.actingHostIds) {
                        const actingHostConn = this.connections.get(actingHostId);
                        if (actingHostConn) {
                            await this.updateHost(actingHostId, actingHostConn);
                        }
                    }
                }
            }

            this.actingHostWaitingFor = undefined;
        });

        this.on("player.chat", async ev => {
            this.logger.info("%s sent message: %s",
                ev.player, chalk.red(ev.chatMessage));

            const prefix = typeof this.config.chatCommands === "object"
                ? this.config.chatCommands.prefix || "/"
                : "/";

            if (this.config.chatCommands && ev.chatMessage.startsWith(prefix)) {
                ev.message?.cancel(); // Prevent message from being broadcasted
                const restMessage = ev.chatMessage.substr(prefix.length);
                const context = new ChatCommandContext(this as any, ev.player, ev.chatMessage);
                try {
                    await this.chatCommandHandler.parseMessage(context, restMessage);
                } catch (e) {
                    if (e instanceof CommandCallError) {
                        await context.reply(e.message);
                    } else {
                        this.logger.error("Error while executing command %s: %s",
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
        const ev = await this.worker.emit(event);

        if ((ev as any).canceled || (ev as any).reverted) {
            return ev;
        }

        return super.emit(event);
    }

    [Symbol.for("nodejs.util.inspect.custom")]() {
        const paren = fmtLogFormat(
            this.worker.config.logging.rooms?.format || ["players", "map", "issaah"],
            {
                players: this.players.size + "/" + this.settings.maxPlayers + " players",
                map: logMaps[this.settings.map],
                issaah: this.config.serverAsHost ? "SaaH" : undefined
            }
        );

        return chalk.yellow(fmtCode(this.code))
            + (paren ? " " + chalk.grey("(" + paren + ")") : "");
    }

    get host(): PlayerData<this>|undefined {
        if (this.config.serverAsHost) {
            return this.players.get(this.actingHostIds[Symbol.iterator]().next().value);
        }

        return this.players.get(this.hostId);
    }

    /**
     * An array of all acting hosts in the room.
     */
    getActingHosts() {
        const hosts = [];
        for (const actingHostId of this.actingHostIds) {
            const player = this.players.get(actingHostId);
            if (player) {
                hosts.push(player);
            }
        }
        return hosts;
    }

    get hostIsMe() {
        return this.hostId === SpecialClientId.Server;
    }

    /**
     * The name of the room, or just the code formatted as a string.
     *
     * @example REDSUS
     * @example LOCAL
     */
    get roomName() {
        if (this.roomNameOverride !== undefined) {
            return this.roomNameOverride;
        }

        const hostConnection = this.host ? this.connections.get(this.host.clientId) : undefined;

        return hostConnection?.username || fmtCode(this.code);
    }

    /**
     * Whether or not this room has been destroyed, and is no longer active on the server.
     */
    get destroyed() {
        return this.gameState === GameState.Destroyed;
    }

    /**
     * Destroy this room.
     * @param reason Reason for the destroying the room.
     */
    async destroy(reason = DisconnectReason.Destroy) {
        const ev = await this.emit(new RoomBeforeDestroyEvent(this, reason));

        if (ev.canceled)
            return;

        super.destroy();

        await this.broadcastMessages([], [
            new RemoveGameMessage(reason)
        ]);

        this.gameState = GameState.Destroyed;
        this.worker.rooms.delete(this.code);

        this.emit(new RoomDestroyEvent(this));

        this.logger.info("Room was destroyed.");
    }

    async FixedUpdate() {
        const curTime = Date.now();
        const delta = curTime - this.last_fixed_update;

        if (this.config.createTimeout > 0 && curTime - this.createdAt > this.config.createTimeout * 1000 && !this.playerJoinedFlag) {
            this.destroy(DisconnectReason.ServerRequest);
            this.playerJoinedFlag = true;
        }

        this.last_fixed_update = Date.now();

        for (const [, component] of this.netobjects) {
            if (!component)
                continue;

            component.FixedUpdate(delta / 1000);

            if (component.dirtyBit <= 0)
                continue;

            component.PreSerialize();
            const writer = HazelWriter.alloc(0);
            if (component.Serialize(writer, false)) {
                this.messageStream.push(new DataMessage(component.netId, writer.buffer));
            }
            component.dirtyBit = 0;
        }

        if (this.endGameIntents.length) {
            const endGameIntents = this.endGameIntents;
            this.endGameIntents = [];
            if (this.hostIsMe) {
                for (let i = 0; i < endGameIntents.length; i++) {
                    const intent = endGameIntents[i];
                    const ev = await this.emit(
                        new RoomEndGameIntentEvent(
                            this,
                            intent.name,
                            intent.reason,
                            intent.metadata
                        )
                    );
                    if (ev.canceled) {
                        endGameIntents.splice(i, 1);
                        i--;
                    }
                }

                const firstIntent = endGameIntents[0];
                if (firstIntent) {
                    this.endGame(firstIntent.reason, firstIntent);
                }
            }
        }

        const ev = await this.emit(
            new RoomFixedUpdateEvent(
                this,
                this.messageStream,
                delta
            )
        );

        if (!ev.canceled && this.messageStream.length) {
            const stream = this.messageStream;
            this.messageStream = [];
            await this.broadcast(stream);
        }
    }

    /**
     * Get all real client-server connections for a list of players. That is, connections for
     * all players that are being controlled by a remote client/real player.
     *
     * See {@link BaseRoom.getConnections} to get connections for a list of players and
     * returned in the same order & place as the players provided, although some connections
     * may not exist, resulting in `undefined`s.
     * @param players The list of players to get connections for.
     * @returns All real connections for the players provided.
     */
    getRealConnections(players: PlayerDataResolvable[]) {
        const connections = [];
        for (let i = 0; i < players.length; i++) {
            const playerResolvable = players[i];
            const connection = this.getConnection(playerResolvable);
            if (connection) {
                connections.push(connection);
            }
        }
        return connections;
    }

    /**
     * Get all client-server connections for a list of players. If a player only exists ont he server,
     * i.e. they are being controlled by a remote client/real player, their place in the list will be `undefined`.
     * @param players The players to get connections for.
     * @returns A list of connections for the players, in the same order.
     */
    getConnections(players: PlayerDataResolvable[]) {
        return players.map(player => this.getConnection(player));
    }

    /**
     * Get the client-server connection of a player.
     * @returns The connection of the player, or undefined if they only exist on the server.
     */
    getConnection(player: PlayerDataResolvable) {
        const clientId = this.resolvePlayerClientID(player);

        if (!clientId)
            return undefined;

        return this.connections.get(clientId);
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

    /**
     * Ban player from a room
     * @param connection The connection or the player that should be banned.
     * @param messages The messages in that the banned player gets displayed.
     */
    banPlayer(connection: Connection|PlayerData, message?: string): void {
        if (connection instanceof PlayerData) {
            return this.banPlayer(this.getConnection(connection) as Connection, message);
        }

        if (!connection) {
            return;
        }

        const player = connection.getPlayer();
        if (!player) {
            return;
        }

        this.bannedAddresses.add(connection.remoteInfo.address);
        connection.disconnect(message ?? DisconnectReason.Banned);

        this.logger.info("%s was banned from the room by the server" + message ? ". Message: " + message : "", player);
    }

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

        if (clientsToBroadcast.length === 1) {
            const singleClient = clientsToBroadcast[0];

            if (!singleClient)
                return;

            if (clientsToExclude.has(singleClient))
                return;

            if (this.playerPerspectives.has(singleClient.clientId))
                return;

            const ev = await this.emit(
                new ClientBroadcastEvent(
                    this,
                    singleClient,
                    gamedata,
                    payloads
                )
            );

            if (!ev.canceled) {
                const messages = [
                    ...(ev.alteredGameData.length
                        ? [
                            new GameDataToMessage(
                                this.code,
                                singleClient.clientId,
                                ev.alteredGameData
                            )
                        ] : []
                    ),
                    ...payloads
                ] as BaseRootMessage[];

                if (messages.length) {
                    promises.push(
                        singleClient.sendPacket(
                            reliable
                                ? new ReliablePacket(
                                    singleClient.getNextNonce(),
                                    messages
                                )
                                : new UnreliablePacket(messages)
                        )
                    );
                }
            }

            return;
        }

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

    async broadcastMovement(
        component: CustomNetworkTransform,
        data: Buffer
    ) {
        const sender = component.player;
        const movementPacket = new UnreliablePacket(
            [
                new GameDataMessage(
                    this.code,
                    [
                        new DataMessage(
                            component.netId,
                            data
                        )
                    ]
                )
            ]
        );

        if (this.worker.config.optimizations.movement.updateRate > 1) {
            const velx = data.readUInt16LE(6);
            const vely = data.readUInt16LE(8);
            const velocity = new Vector2(Vector2.lerp(velx / 65535), Vector2.lerp(vely / 65535));
            const magnitude = Vector2.null.dist(velocity);

            if (magnitude > 0.5) {
                let movementTick = (sender as any)[_movementTick] || 0;
                movementTick++;
                (sender as any)[_movementTick] = movementTick;

                if (movementTick % this.worker.config.optimizations.movement.updateRate !== 0) {
                    return;
                }
            }
        }

        const writer = this.worker.config.optimizations.movement.reuseBuffer
            ? HazelWriter.alloc(22)
                .uint8(0)
                .write(movementPacket, MessageDirection.Clientbound, this.decoder)
            : undefined;

        const promises = [];

        for (const [ clientId, player ] of this.players) {
            const connection = this.connections.get(clientId);

            if (player === sender || !connection)
                continue;

            if (player.transform && this.worker.config.optimizations.movement.visionChecks) {
                const dist = component.position.dist(player.transform.position);

                if (dist >= 7) // todo: ignore this check if the player is near the admin table
                    continue;
            }

            if (this.worker.config.optimizations.movement.deadChecks && sender.playerInfo?.isDead && !player.playerInfo?.isDead)
                continue;

            if (writer) {
                promises.push(
                    this.worker.sendRawPacket(
                        connection.remoteInfo,
                        writer.buffer
                    )
                );
            } else {
                promises.push(
                    this.worker.sendPacket(
                        connection,
                        movementPacket
                    )
                );
            }
        }

        await Promise.all(promises);
    }

    async broadcast(
        gamedata: BaseGameDataMessage[],
        payloads: BaseRootMessage[] = [],
        include?: PlayerDataResolvable[],
        exclude?: PlayerDataResolvable[],
        reliable = true
    ) {
        const includeConnections = include ? this.getRealConnections(include) : undefined;
        const excludedConnections = exclude ? this.getRealConnections(exclude) : undefined;

        if (!this.worker.config.optimizations.disablePerspectives) {
            for (let i = 0; i < this.activePerspectives.length; i++) {
                const activePerspective = this.activePerspectives[i];

                const gamedataNotCanceled = [];
                const payloadsNotCanceled = [];
                for (let i = 0; i < gamedata.length; i++) {
                    const child = gamedata[i];

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

                    gamedataNotCanceled.push(child);
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

                if (gamedataNotCanceled.length || payloadsNotCanceled.length) {
                    return this.broadcastMessages(gamedataNotCanceled, payloadsNotCanceled, includeConnections, excludedConnections, reliable);
                }
            }
        }

        return this.broadcastMessages(gamedata, payloads, includeConnections, excludedConnections, reliable);
    }

    async setCode(code: number|string): Promise<void> {
        if (typeof code === "string") {
            return this.setCode(GameCode.convertStringToInt(code));
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

    /**
     * Update the host for the room or for a specific client.
     * @param hostId The host to set.
     * @param recipient The specific client recipient if required.
     */
    async updateHost(hostId: number, recipient?: Connection) {
        await this.broadcastMessages([], [
            new JoinGameMessage(
                this.code,
                SpecialClientId.Temp,
                hostId,
                "TEMP",
                new PlatformSpecificData(Platform.StandaloneSteamPC, "TESTNAME"),
                0,
                "",
                ""
            ),
            new RemovePlayerMessage(
                this.code,
                SpecialClientId.Temp,
                DisconnectReason.Error,
                hostId
            )
        ], recipient ? [ recipient ] : undefined);
    }

    /**
     * Set the actual host for the room, cannot be used in rooms using SaaH.
     * @param playerResolvable The player to set as the host.
     */
    async setHost(playerResolvable: PlayerDataResolvable) {
        if (this.config.serverAsHost)
            throw new Error("Cannot set setHost while in SaaH mode, use addActingHost and removeActingHost");

        const resolvedId = this.resolvePlayerClientID(playerResolvable);

        if (!resolvedId)
            return;

        const remote = this.connections.get(resolvedId);

        if (!remote)
            throw new Error("Cannot set host without a connection");

        this.hostId = resolvedId;

        const player = this.players.get(resolvedId);
        if (player) {
            await player.emit(new PlayerSetHostEvent(this, player));
        }

        this.logger.info("%s is now the host", player || remote);

        if (this.gameState === GameState.Ended && this.waitingForHost.has(remote)) {
            this.gameState = GameState.NotStarted;
            await this._joinOtherClients();
        }

        for (const [ , connection ] of this.connections) {
            if (this.actingHostsEnabled && this.actingHostIds.has(connection.clientId)) {
                await this.updateHost(connection.clientId, connection);
            } else {
                await this.updateHost(this.hostId, connection);
            }
        }
    }

    /**
     * Enable SaaH (Server-as-a-Host) on this room.
     *
     * Does nothing particularly special except tell clients that the server is now the host.
     * @param saahEnabled Whether or not SaaH should be enabled.
     * @param addActingHost Whether or not to add the current host as an acting host
     */
    async enableSaaH(addActingHost: boolean) {
        if (addActingHost && this.hostId !== SpecialClientId.Server) {
            this.actingHostIds.add(this.hostId);
        }

        this.hostId = SpecialClientId.Server;

        for (const [ , connection ] of this.connections) {
            if (this.actingHostWaitingFor === undefined && this.actingHostsEnabled && this.actingHostIds.has(connection.clientId)) {
                await this.updateHost(connection.clientId, connection);
            } else {
                await this.updateHost(SpecialClientId.Server, connection);
            }
        }

        this.logger.info("The server is now the host");
    }

    /**
     * Disable SaaH (Server-as-a-Host) on this room, assigning a new host (the first acting host if available),
     * and tell clients the new host (unless they are an acting host.).
     *
     * Does nothing particularly special except tell clients that the server is now the host.
     * @param saahEnabled Whether or not SaaH should be enabled.
     * @param addActingHost Whether or not to add the current host as an acting host
     */
    async disableSaaH() {
        const connection = this.actingHostIds.size > 0
            ? this.connections.get([...this.actingHostIds][0])
            : [...this.connections.values()][0];

        if (!connection) {
            this.logger.warn("The server is no longer the host, but there's no acting host to take over; set a host manually with 'sethost'");
            return;
        }

        const ev = await this.emit(new RoomSelectHostEvent(this, false, false, connection));

        if (!ev.canceled) {
            const player = ev.alteredSelected.getPlayer();

            this.hostId = ev.alteredSelected.clientId; // set host manually as the connection has not been created yet
            this.actingHostIds.delete(this.hostId);
            if (player) {
                await player.emit(new PlayerSetHostEvent(this, player));
            }

            this.logger.info("The server is no longer the host, new host: %s", player || connection);

            if (this.gameState === GameState.Ended && this.waitingForHost.has(ev.alteredSelected)) {
                this.gameState = GameState.NotStarted;
                await this._joinOtherClients();
            }
        }

        for (const [ , connection ] of this.connections) {
            if (this.actingHostsEnabled && this.actingHostIds.has(connection.clientId)) {
                await this.updateHost(connection.clientId, connection);
            } else {
                await this.updateHost(this.hostId, connection);
            }
        }
    }

    /**
     * Set whether SaaH is enabled on this room, calling either {@link BaseRoom.enableSaaH} or
     * {@link BaseRoom.disableSaaH}.
     * and tell clients the new host (unless they are an acting host.).
     * @param saahEnabled Whether or not SaaH should be enabled.
     * @param addActingHost Whether or not to add the current host as an acting host
     */
    async setSaaHEnabled(saahEnabled: boolean, addActingHost: boolean) {
        this.config.serverAsHost = saahEnabled;
        if (saahEnabled) {
            await this.enableSaaH(addActingHost);
        } else {
            await this.disableSaaH();
        }
    }

    /**
     * Add another acting host to a Server-As-A-Host room.
     * @param player The player to make host.
     */
    async addActingHost(player: PlayerData<this>|Connection) {
        this.actingHostIds.add(player.clientId);

        const connection = player instanceof Connection ? player : this.connections.get(player.clientId);

        this.logger.info("%s is now an acting host", connection || player);

        if (connection && this.actingHostWaitingFor === undefined) {
            await this.updateHost(player.clientId, connection);
        }
    }

    /**
     * Remove an acting host from a Server-As-A-Host room.
     * @param player The player to remove as host.
     */
    async removeActingHost(player: PlayerData<this>|Connection) {
        this.actingHostIds.delete(player.clientId);

        const connection = player instanceof Connection ? player : this.connections.get(player.clientId);

        this.logger.info("%s is no longer an acting host", connection || player);

        if (connection) {
            await this.updateHost(SpecialClientId.Server, connection);
        }
    }

    /**
     * Disable acting hosts on the room, leaving either no hosts if the server is
     * in SaaH mode, or leaving 1 host otherwise. It doesn't clear the list of
     * acting hosts, just disables them from being in use.
     *
     * This function will prevent any acting hosts from being assigned at any point
     * until enabled again with {@link BaseRoom.enableActingHosts}.
     */
    async disableActingHosts() {
        if (!this.actingHostsEnabled)
            throw new Error("Acting hosts are already disabled");

        for (const actingHostId of this.actingHostIds) {
            const connection = this.connections.get(actingHostId);
            if (connection) {
                if (this.config.serverAsHost) {
                    await this.updateHost(SpecialClientId.Server, connection);
                } else {
                    await this.updateHost(this.hostId, connection);
                }
            }
        }
        this.actingHostsEnabled = false;
        this.logger.info("Disabled acting hosts");
    }

    /**
     * Enable acting hosts on the room.
     */
    async enableActingHosts() {
        if (this.actingHostsEnabled)
            throw new Error("Acting hosts are already enabled");

        for (const actingHostId of this.actingHostIds) {
            const connection = this.connections.get(actingHostId);
            if (connection) {
                await this.updateHost(connection.clientId, connection);
            }
        }
        this.actingHostsEnabled = true;
        this.logger.info("Enabled acting hosts");
    }

    /**
     * Set whether or not acting hosts are enabled, calling either {@link BaseRoom.disableActingHosts}
     * or {@link BaseRoom.enableActingHosts}.
     * @param actingHostsEnabled Whether or not to enable acting hosts
     */
    async setActingHostsEnabled(actingHostsEnabled: boolean) {
        if (actingHostsEnabled) {
            await this.enableActingHosts();
        } else {
            await this.disableActingHosts();
        }
    }

    async handleJoin(joinInfo: PlayerJoinData): Promise<PlayerData<this>> {
        const cachedPlayer = this.players.get(joinInfo.clientId);
        if (cachedPlayer)
            return cachedPlayer;

        const player = new PlayerData(this, joinInfo.clientId, joinInfo.playerName, joinInfo.platform, joinInfo.playerLevel);
        this.players.set(joinInfo.clientId, player);

        if (this.hostIsMe) {
            this.spawnNecessaryObjects();
        }

        return player;
    }

    async handleRemoteJoin(joiningClient: Connection) {
        if (this.connections.get(joiningClient.clientId))
            return;

        const joinData = new PlayerJoinData(
            joiningClient.clientId,
            joiningClient.username,
            joiningClient.platform,
            joiningClient.playerLevel,
            "", // todo: combine worker with matchmaker
            ""
        );

        const joiningPlayer = await this.handleJoin(joinData) || this.players.get(joiningClient.clientId);

        if (!joiningPlayer)
            return;

        if (this.config.serverAsHost) {
            if (this.actingHostIds.size === 0) {
                const ev = await this.emit(new RoomSelectHostEvent(this, true, true, joiningClient));

                if (!ev.canceled) {
                    await this.addActingHost(joiningPlayer);
                }
            }
        } else {
            if (!this.host) {
                const ev = await this.emit(new RoomSelectHostEvent(this, false, true, joiningClient));
                if (!ev.canceled) {
                    this.hostId = ev.alteredSelected.clientId; // set host manually as the connection has not been created yet
                    await joiningPlayer.emit(new PlayerSetHostEvent(this, joiningPlayer));
                }
            }
        }

        joiningClient.room = this;
        if (this.gameState === GameState.Ended && !this.config.serverAsHost) {
            if (joiningClient.clientId === this.hostId) {
                this.gameState = GameState.NotStarted;
                this.waitingForHost.add(joiningClient);
                this.connections.set(joiningClient.clientId, joiningClient);

                this.logger.info("%s joined, joining other clients..",
                    joiningPlayer);

                this.gameState = GameState.NotStarted;

                await this.broadcastMessages([], [
                    new JoinGameMessage(
                        this.code,
                        joiningClient.clientId,
                        this.hostId,
                        joiningClient.username,
                        joiningClient.platform,
                        joiningClient.playerLevel,
                        "",
                        ""
                    )
                ], undefined, [ joiningClient ]);

                await this._joinOtherClients();
            } else {
                this.waitingForHost.add(joiningClient);
                this.connections.set(joiningClient.clientId, joiningClient);

                await this.broadcastMessages([], [
                    new JoinGameMessage(
                        this.code,
                        joiningClient.clientId,
                        this.hostId,
                        joiningClient.username,
                        joiningClient.platform,
                        joiningClient.playerLevel,
                        "",
                        ""
                    )
                ], undefined, [ joiningClient ]);

                await joiningClient.sendPacket(
                    new ReliablePacket(
                        joiningClient.getNextNonce(),
                        [
                            new WaitForHostMessage(
                                this.code,
                                joiningClient.clientId
                            )
                        ]
                    )
                );

                this.logger.info("%s joined, waiting for host",
                    joiningPlayer);
            }
            return;
        }

        this.actingHostWaitingFor = joiningPlayer;

        await joiningClient.sendPacket(
            new ReliablePacket(
                joiningClient.getNextNonce(),
                [
                    new JoinedGameMessage(
                        this.code,
                        joiningClient.clientId,
                        this.hostId,
                        [...this.connections]
                            .map(([ , client ]) => new PlayerJoinData(
                                client.clientId,
                                client.username,
                                client.platform,
                                client.playerLevel,
                                "",
                                ""
                            ))
                    ),
                    new AlterGameMessage(
                        this.code,
                        AlterGameTag.ChangePrivacy,
                        this.privacy === "public" ? 1 : 0
                    )
                ]
            )
        );

        const promises = [];
        for (const [ clientId, connection ] of this.connections) {
            if (this.players.has(clientId)) {
                promises.push(connection.sendPacket(
                    new ReliablePacket(
                        connection.getNextNonce(),
                        [
                            new JoinGameMessage(
                                this.code,
                                joiningClient.clientId,
                                this.hostId,
                                joiningClient.username,
                                joiningClient.platform,
                                joiningClient.playerLevel,
                                "",
                                ""
                            )
                        ]
                    )
                ));
            }
        }
        await Promise.all(promises);

        this.connections.set(joiningClient.clientId, joiningClient);
        this.playerJoinedFlag = true;

        await this.emit(
            new PlayerJoinEvent(
                this,
                joiningPlayer
            )
        );

        this.logger.info(
            "%s joined the game",
            joiningClient
        );

        if (this.gameState === GameState.Ended) {
            this.gameState = GameState.NotStarted;
        }

        if (this.hostIsMe) {
            if (!this.lobbyBehaviour && this.gameState === GameState.NotStarted) {
                this.spawnPrefab(SpawnType.LobbyBehaviour, -2);
            }

            if (!this.gameData) {
                this.spawnPrefab(SpawnType.GameData, -2);
            }
        }
    }

    async handleRemoteLeave(leavingConnection: Connection, reason: DisconnectReason = DisconnectReason.Error) {
        this.waitingForHost.delete(leavingConnection);
        this.connections.delete(leavingConnection.clientId);
        leavingConnection.room = undefined;

        await this.handleLeave(leavingConnection.clientId);

        if (this.connections.size === 0) {
            await this.destroy();
            return;
        }

        if (this.actingHostIds.has(leavingConnection.clientId)) {
            this.actingHostIds.delete(leavingConnection.clientId);
        }

        if (this.config.serverAsHost) {
            if (this.actingHostIds.size === 0) {
                const newHostConn = [...this.connections.values()][0];
                const ev = await this.emit(new RoomSelectHostEvent(this, true, false, newHostConn));

                if (!ev.canceled) {
                    await this.addActingHost(ev.alteredSelected);
                }
            }
        } else {
            if (this.hostId === leavingConnection.clientId) {
                const newHostConn = [...this.connections.values()][0];
                const ev = await this.emit(new RoomSelectHostEvent(this, false, false, newHostConn));

                if (!ev.canceled) {
                    const player = ev.alteredSelected.getPlayer();

                    this.hostId = ev.alteredSelected.clientId; // set host manually as the connection has not been created yet
                    if (player) {
                        await player.emit(new PlayerSetHostEvent(this, player));
                    }

                    if (this.gameState === GameState.Ended && this.waitingForHost.has(ev.alteredSelected)) {
                        this.gameState = GameState.NotStarted;
                        await this._joinOtherClients();
                    }
                }
            }
        }

        const promises = [];
        for (const [ , connection ] of this.connections) {
            promises.push(connection.sendPacket(
                new ReliablePacket(
                    connection.getNextNonce(),
                    [
                        new RemovePlayerMessage(
                            this.code,
                            leavingConnection.clientId,
                            reason,
                            this.config.serverAsHost
                                ? SpecialClientId.Server
                                : this.actingHostsEnabled
                                    ? this.actingHostIds.has(connection.clientId)
                                        ? connection.clientId
                                        : this.hostId
                                    : this.hostId
                        )
                    ]
                )
            ));
        }
        await Promise.all(promises);

        this.logger.info(
            "%s left or was removed.",
            leavingConnection
        );
    }

    private async _joinOtherClients() {
        await Promise.all(
            [...this.connections]
                .map(([ clientId, client ]) => {
                    if (this.waitingForHost.has(client)) {
                        this.waitingForHost.delete(client);

                        return client?.sendPacket(
                            new ReliablePacket(
                                client.getNextNonce(),
                                [
                                    new JoinedGameMessage(
                                        this.code,
                                        clientId,
                                        this.actingHostsEnabled
                                            ? this.actingHostIds.has(clientId)
                                                ? clientId
                                                : this.hostId
                                            : this.hostId,
                                        [...this.connections.values()]
                                            .reduce<PlayerJoinData[]>((prev, cur) => {
                                                if (cur !== client) {
                                                    prev.push(new PlayerJoinData(
                                                        cur.clientId,
                                                        cur.username,
                                                        cur.platform,
                                                        cur.playerLevel,
                                                        "",
                                                        ""
                                                    ));
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

        this.waitingForHost.clear();
    }

    async handleStart() {
        if (this.actingHostsEnabled) {
            for (const actingHostId of this.actingHostIds) {
                const actingHostConn = this.connections.get(actingHostId);
                if (actingHostConn) {
                    await this.updateHost(SpecialClientId.Server, actingHostConn);
                }
            }
        }

        this.gameState = GameState.Started;

        const ev = await this.emit(new RoomGameStartEvent(this));

        if (ev.canceled) {
            this.gameState = GameState.NotStarted;
            if (this.actingHostsEnabled) {
                for (const actingHostId of this.actingHostIds) {
                    const actingHostConn = this.connections.get(actingHostId);
                    if (actingHostConn) {
                        await this.updateHost(actingHostId, actingHostConn);
                    }
                }
            }
            return;
        }

        await this.broadcastMessages([], [
            new StartGameMessage(this.code)
        ]);

        this.logger.info("Game started");

        if (this.hostIsMe) {
            await Promise.race([
                Promise.all(
                    [...this.players.values()].map((player) => {
                        if (player.isReady) {
                            return Promise.resolve();
                        }

                        return new Promise<void>((resolve) => {
                            player.once("player.ready", () => {
                                resolve();
                            });
                        });
                    })
                ),
                sleep(3000),
            ]);

            const removes = [];
            for (const [clientid, player] of this.players) {
                if (!player.isReady) {
                    await this.handleLeave(player);
                    removes.push(clientid);
                }
            }

            if (removes.length) {
                await this.broadcast(
                    [],
                    removes.map((clientid) => {
                        return new RemovePlayerMessage(
                            this.code,
                            clientid,
                            DisconnectReason.Error,
                            this.hostId
                        );
                    })
                );
            }

            if (this.lobbyBehaviour)
                this.despawnComponent(this.lobbyBehaviour);

            const ship_prefabs = [
                SpawnType.SkeldShipStatus,
                SpawnType.MiraShipStatus,
                SpawnType.Polus,
                SpawnType.AprilShipStatus,
                SpawnType.Airship
            ];

            this.spawnPrefab(ship_prefabs[this.settings?.map] || 0, -2);
            await this.shipStatus?.assignTasks();
            await this.shipStatus?.assignRoles();

            if (this.shipStatus) {
                for (const [ , player ] of this.players) {
                    this.shipStatus.spawnPlayer(player, true);
                }
            }
        }
    }

    async startGame() {
        await this.handleStart();
    }

    async handleEnd(reason: GameOverReason, intent?: EndGameIntent) {
        const waiting = this.waitingForHost;
        this.waitingForHost = new Set;
        this.gameState = GameState.Ended;

        const ev = await this.emit(new RoomGameEndEvent(this, reason, intent));

        if (ev.canceled) {
            this.waitingForHost = waiting;
            this.gameState = GameState.Started;
            return;
        }

        for (const [ , component ] of this.netobjects) {
            component.despawn();
        }

        await this.broadcastMessages([], [
            new EndGameMessage(this.code, reason, false)
        ]);

        this.logger.info("Game ended: %s", GameOverReason[ev.reason]);

        setImmediate(() => {
            this.logger.info("Clearing connections for clients to re-join");
            this.connections.clear();
        });
    }

    async endGame(reason: GameOverReason, intent?: EndGameIntent) {
        await this.handleEnd(reason, intent);
    }

    private getOtherPlayer(base: PlayerData<this>) {
        for (const [ , player ] of this.players) {
            if (player.playerInfo?.defaultOutfit && player.playerInfo.defaultOutfit.color > -1 && player.control && base !== player) {
                return player;
            }
        }

        return undefined;
    }

    private async _sendChatFor(player: PlayerData<this>, message: string, options: SendChatOptions) {
        const sendPlayer = options.side === MessageSide.Left
            ? this.getOtherPlayer(player) || player
            : player;

        if (!sendPlayer.control)
            return;

        if (!sendPlayer.playerInfo)
            return;

        const defaultOutfit = sendPlayer.playerInfo.defaultOutfit;

        const oldName = defaultOutfit.name;
        const oldColor = defaultOutfit.color;
        const oldHat = defaultOutfit.hatId;
        const oldSkin = defaultOutfit.skinId;
        const oldVisor = defaultOutfit.visorId;

        await this.broadcast([
            new RpcMessage(
                sendPlayer.control.netId,
                new SetNameMessage(options.name)
            ),
            new RpcMessage(
                sendPlayer.control.netId,
                new SetColorMessage(options.color)
            ),
            new RpcMessage(
                sendPlayer.control.netId,
                new SetHatMessage(options.hatId)
            ),
            new RpcMessage(
                sendPlayer.control.netId,
                new SetSkinMessage(options.skinId)
            ),
            new RpcMessage(
                sendPlayer.control.netId,
                new SetVisorMessage(options.visorId)
            ),
            new RpcMessage(
                sendPlayer.control.netId,
                new SendChatMessage(message)
            ),
            new RpcMessage(
                sendPlayer.control.netId,
                new SetNameMessage(oldName)
            ),
            new RpcMessage(
                sendPlayer.control.netId,
                new SetColorMessage(oldColor)
            ),
            new RpcMessage(
                sendPlayer.control.netId,
                new SetHatMessage(oldHat)
            ),
            new RpcMessage(
                sendPlayer.control.netId,
                new SetSkinMessage(oldSkin)
            ),
            new RpcMessage(
                sendPlayer.control.netId,
                new SetVisorMessage(oldVisor)
            )
        ], undefined, [ player ]);
    }

    /**
     * Send a message into the chat as the server. Requries game data to be spawned,
     * can only send messages on the left side of the chat room if there is at least
     * 2 players in the room.
     *
     * @summary
     * If on the right side, for each player the room sets their name and colour,
     * sends the message then immediately sets them back.
     *
     * If on the left side, for each player the room finds a different player,
     * sets their name and colour and immediately sets them back after sending
     * the message. If there is no other player, it shows it on the right side
     * instead.
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
    async sendChat(message: string, options: Partial<SendChatOptions> = {}): Promise<boolean> {
        if (!this.gameData)
            return false;

        const colorMap = Color as any as {[key: string]: Color};

        const defaultOptions: SendChatOptions = {
            side: MessageSide.Left,
            targets: undefined,
            name: this.config.serverPlayer.name || "<color=yellow>[Server]</color>",
            color: colorMap[this.config.serverPlayer.color || "Yellow"],
            hatId: this.config.serverPlayer.hat || Hat.NoHat,
            skinId: this.config.serverPlayer.skin || Skin.None,
            visorId: this.config.serverPlayer.visor || Visor.EmptyVisor,
            ...options
        };

        const promises = [];
        if (defaultOptions.targets) {
            for (const player of defaultOptions.targets) {
                promises.push(this._sendChatFor(player as PlayerData<this>, message, defaultOptions));
            }
        } else {
            for (const [ , player ] of this.players) {
                promises.push(this._sendChatFor(player, message, defaultOptions));
            }
        }
        await Promise.all(promises);
        return true;
    }

    /**
     * Add an override for the name of the room. Can be used anywhere, but only
     * used in Among Us in the "find public games" list.
     * @param roomName The name of the room to use instead.
     */
    setRoomNameOverride(roomName: string) {
        this.roomNameOverride = roomName;
    }

    /**
     * Clear a room name override made with {@link setRoomNameOverride}.
     */
    clearRoomNameOverride() {
        this.roomNameOverride = undefined;
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
