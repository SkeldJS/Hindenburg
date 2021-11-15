import chalk from "chalk";

import {
    AlterGameTag,
    Color,
    DisconnectReason,
    GameMap,
    GameOverReason,
    GameState,
    Hat,
    Skin,
    SpawnType
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
    ReliablePacket,
    RemoveGameMessage,
    RemovePlayerMessage,
    RpcMessage,
    SendChatMessage,
    SetColorMessage,
    SetHatMessage,
    SetNameMessage,
    SetSkinMessage,
    StartGameMessage,
    UnreliablePacket,
    WaitForHostMessage
} from "@skeldjs/protocol";

import {
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
import { Code2Int, HazelWriter, sleep } from "@skeldjs/util";
import { SkeldjsStateManager } from "@skeldjs/state";


import { Connection } from "./Connection";
import { Worker } from "./Worker";
import { Perspective, PresetFilter } from "./Perspective";

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
} from "./api";

import {
    SendChatOptions,
    MessageSide,
    RoomsConfig
} from "./interfaces";

import {
    CommandCallError,
    ChatCommandContext,
    RoomPlugin,
    ChatCommandHandler
} from "./handlers";

import { fmtCode } from "./util/fmtCode";
import { fmtLogFormat } from "./util/fmtLogFormat";
import { Logger } from "./logger";

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
                ishost: isHost ? "host" : isActingHost ? "acting host" : undefined
            }
        );

        return chalk.blue(this.info?.name || "<No Name>")
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
     * The state that the game is currently in, after starting, ending or destroying a game.
     */
    state: GameState;

    /**
     * Player that the server is waiting to finish joining before resetting all
     * acting hosts back.
     */
    actingHostWaitingFor: PlayerData|undefined;

    /**
     * All plugins loaded and scoped to the room, mapped by plugin id to room plugin object.
     */
    loadedPlugins: Map<string, RoomPlugin>;
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

        this.state = GameState.NotStarted;
        this.actingHostWaitingFor = undefined;

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
            this.worker.config.logging.rooms?.format || ["players", "map", "saah"],
            {
                players: this.players.size + "/" + this.settings.maxPlayers + " players",
                map: logMaps[this.settings.map],
                saah: this.config.serverAsHost ? "SaaH" : undefined
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
        return this.state === GameState.Destroyed;
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

        this.state = GameState.Destroyed;
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
                this.stream.push(new DataMessage(component.netId, writer.buffer));
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
                this.stream,
                delta
            )
        );

        if (!ev.canceled && this.stream.length) {
            const stream = this.stream;
            this.stream = [];
            await this.broadcast(stream);
        }
    }

    getConnections(players: PlayerData[]|undefined) {
        return players
            ? players
                .reduce<Connection[]>((acc, player) => {
                    const connection = this.connections.get(player.clientId);
                    if (connection) {
                        acc.push(connection);
                    }
                    return acc;
                }, [])
            : undefined;
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
            ? this.connections.get(recipient.clientId)
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

        if (this.state === GameState.Ended && this.waitingForHost.has(remote)) {
            this.state = GameState.NotStarted;
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
     * Set whether SaaH is enabled on this room.
     *
     * If enabling SaaH, it will do nothing special except tell clients that the
     * server is now the host.
     *
     * If disabling SaaH, it will assign a new host (the first acting host if available),
     * and tell clients the new host (unless they are an acting host.).
     * @param saahEnabled Whether or not SaaH should be enabled.
     */
    async setSaaHEnabled(saahEnabled: boolean) {
        this.config.serverAsHost = saahEnabled;
        if (saahEnabled) {
            this.hostId = SpecialClientId.Server;

            for (const [ , connection ] of this.connections) {
                if (this.actingHostsEnabled && this.actingHostIds.has(connection.clientId)) {
                    await this.updateHost(connection.clientId, connection);
                } else {
                    await this.updateHost(SpecialClientId.Server, connection);
                }
            }
        } else {
            const connection = this.actingHostIds.size > 0
                ? this.connections.get([...this.actingHostIds][0])
                : [...this.connections.values()][0];

            if (!connection)
                return;

            const ev = await this.emit(new RoomSelectHostEvent(this, false, false, connection));

            if (!ev.canceled) {
                const player = ev.alteredSelected.getPlayer();

                this.hostId = ev.alteredSelected.clientId; // set host manually as the connection has not been created yet
                this.actingHostIds.delete(this.hostId);
                if (player) {
                    await player.emit(new PlayerSetHostEvent(this, player));
                }

                if (this.state === GameState.Ended && this.waitingForHost.has(ev.alteredSelected)) {
                    this.state = GameState.NotStarted;
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
    }

    /**
     * Add another acting host to a Server-As-A-Host room.
     * @param player The player to make host.
     */
    async addActingHost(player: PlayerData<this>|Connection) {
        this.actingHostIds.add(player.clientId);

        const connection = player instanceof Connection ? player : this.connections.get(player.clientId);

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
    }

    /**
     * Enable acting hosts on the room.
     */
    async enableActingHosts() {
        for (const actingHostId of this.actingHostIds) {
            const connection = this.connections.get(actingHostId);
            if (connection) {
                await this.updateHost(connection.clientId, connection);
            }
        }
        this.actingHostsEnabled = true;
    }

    async handleJoin(clientId: number): Promise<PlayerData<this>|null> {
        if (this.players.has(clientId))
            return null;

        if (this.hostIsMe) {
            await this.spawnNecessaryObjects();
        }

        const player = new PlayerData(this, clientId);
        this.players.set(clientId, player);
        return player;
    }

    async handleRemoteJoin(joiningClient: Connection) {
        if (this.connections.get(joiningClient.clientId))
            return;

        const joiningPlayer = await this.handleJoin(joiningClient.clientId) || this.players.get(joiningClient.clientId);

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
        if (this.state === GameState.Ended && !this.config.serverAsHost) {
            if (joiningClient.clientId === this.hostId) {
                this.state = GameState.NotStarted;
                this.waitingForHost.add(joiningClient);
                this.connections.set(joiningClient.clientId, joiningClient);

                this.logger.info("%s joined, joining other clients..",
                    joiningPlayer);

                this.state = GameState.NotStarted;

                if (this.config.serverAsHost) {
                    const promises = [];
                    for (const [ clientId, connection ] of this.connections) {
                        if (connection === joiningClient) {
                            continue;
                        }

                        promises.push(connection.sendPacket(
                            new ReliablePacket(
                                connection.getNextNonce(),
                                [
                                    new JoinGameMessage(
                                        this.code,
                                        joiningClient.clientId,
                                        this.actingHostsEnabled
                                            ? this.actingHostIds.has(clientId)
                                                ? clientId
                                                : SpecialClientId.Server
                                            : SpecialClientId.Server
                                    )
                                ]
                            )
                        ));
                    }
                    await Promise.all(promises);
                } else {
                    await this.broadcastMessages([], [
                        new JoinGameMessage(
                            this.code,
                            joiningClient.clientId,
                            this.hostId
                        )
                    ], undefined, [ joiningClient ]);
                }

                await this._joinOtherClients();
            } else {
                this.waitingForHost.add(joiningClient);
                this.connections.set(joiningClient.clientId, joiningClient);

                if (this.config.serverAsHost) {
                    const promises = [];
                    for (const [ clientId, connection ] of this.connections) {
                        if (connection === joiningClient) {
                            continue;
                        }

                        promises.push(connection.sendPacket(
                            new ReliablePacket(
                                connection.getNextNonce(),
                                [
                                    new JoinGameMessage(
                                        this.code,
                                        joiningClient.clientId,
                                        this.actingHostsEnabled
                                            ? this.actingHostIds.has(clientId)
                                                ? clientId
                                                : SpecialClientId.Server
                                            : SpecialClientId.Server
                                    )
                                ]
                            )
                        ));
                    }
                    await Promise.all(promises);
                } else {
                    await this.broadcastMessages([], [
                        new JoinGameMessage(
                            this.code,
                            joiningClient.clientId,
                            this.hostId
                        )
                    ], undefined, [ joiningClient ]);
                }

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
                                this.hostId
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

        if (this.state === GameState.Ended) {
            this.state = GameState.NotStarted;
        }

        if (this.hostIsMe) {
            if (!this.lobbyBehaviour && this.state === GameState.NotStarted) {
                this.spawnPrefab(SpawnType.LobbyBehaviour, -2);
            }

            if (!this.gameData) {
                this.spawnPrefab(SpawnType.GameData, -2);
            }
        }
    }

    async handleRemoteLeave(leavingConnection: Connection, reason: DisconnectReason = DisconnectReason.None) {
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

                    if (this.state === GameState.Ended && this.waitingForHost.has(ev.alteredSelected)) {
                        this.state = GameState.NotStarted;
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
                .map(([ clientId, connection ]) => {
                    if (this.waitingForHost.has(connection)) {
                        this.waitingForHost.delete(connection);

                        return connection?.sendPacket(
                            new ReliablePacket(
                                connection.getNextNonce(),
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

        this.state = GameState.Started;

        const ev = await this.emit(new RoomGameStartEvent(this));

        if (ev.canceled) {
            this.state = GameState.NotStarted;
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
                    true,
                    undefined,
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
                SpawnType.ShipStatus,
                SpawnType.Headquarters,
                SpawnType.PlanetMap,
                SpawnType.AprilShipStatus,
                SpawnType.Airship
            ];

            this.spawnPrefab(ship_prefabs[this.settings?.map] || 0, -2);
            await this.shipStatus?.selectImpostors();
            await this.shipStatus?.assignTasks();

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
        this.state = GameState.Ended;

        const ev = await this.emit(new RoomGameEndEvent(this, reason, intent));

        if (ev.canceled) {
            this.waitingForHost = waiting;
            this.state = GameState.Started;
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

    private getOtherPlayer(base: PlayerData) {
        for (const [ , player ] of this.players) {
            if (player.info && player.info.color > -1 && player.control && base !== player) {
                return player;
            }
        }

        return undefined;
    }

    private async _sendChatFor(player: PlayerData, message: string, options: SendChatOptions) {
        const sendPlayer = options.side === MessageSide.Left
            ? this.getOtherPlayer(player) || player
            : player;

        if (!sendPlayer.control)
            return;

        if (!sendPlayer.info)
            return;

        const oldName = sendPlayer.info.name;
        const oldColor = sendPlayer.info.color;
        const oldHat = sendPlayer.info.hat;
        const oldSkin = sendPlayer.info.skin;

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
                new SetHatMessage(options.hat)
            ),
            new RpcMessage(
                sendPlayer.control.netId,
                new SetSkinMessage(options.skin)
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
            )
        ], true, player);
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
        const hatMap = Hat as any as {[key: string]: Hat};
        const skinMap = Skin as any as {[key: string]: Skin};

        const defaultOptions: SendChatOptions = {
            side: MessageSide.Left,
            targets: undefined,
            name: this.config.serverPlayer.name || "<color=yellow>[Server]</color>",
            color: colorMap[this.config.serverPlayer.color || "Yellow"],
            hat: hatMap[this.config.serverPlayer.hat || "None"],
            skin: skinMap[this.config.serverPlayer.skin || "None"],
            ...options
        };

        // Super dumb way of doing the same thing for a single player if specified, or all players if one isn't specified
        const promises = [];
        if (defaultOptions.targets) {
            for (const player of defaultOptions.targets) {
                promises.push(this._sendChatFor(player, message, defaultOptions));
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
