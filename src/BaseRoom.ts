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
    SetNameMessage,
    StartGameMessage,
    UnreliablePacket,
    WaitForHostMessage
} from "@skeldjs/protocol";

import {
    HostableEvents,
    PlayerData,
    PlayerDataResolvable,
    PlayerJoinEvent,
    PlayerSetHostEvent,
    RoomFixedUpdateEvent
} from "@skeldjs/core";

import { BasicEvent, ExtractEventTypes } from "@skeldjs/events";
import { Code2Int, HazelWriter, sleep } from "@skeldjs/util";
import { SkeldjsStateManager } from "@skeldjs/state";


import { Connection } from "./Connection";
import { Worker } from "./Worker";
import { Perspective, PresetFilter } from "./Perspective";

import {
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

Object.defineProperty(PlayerData.prototype, Symbol.for("nodejs.util.inspect.custom"), {
    value(this: PlayerData<BaseRoom>) {
        const connection = this.room.connections.get(this.clientId);

        const paren = fmtLogFormat(
            this.room.worker.config.logging.players?.format || ["id", "ping", "ishost"],
            {
                id: this.clientId,
                ping: connection?.roundTripPing,
                ishost: this.isHost ? "host" : undefined
            }
        );

        return chalk.blue(this.info?.name || "<No Name>")
            + (paren ? " " + chalk.grey("(" + paren + ")") : "");
    }
});

Object.defineProperty(PlayerData.prototype, "isHost", {
    get(this: PlayerData<BaseRoom>) {
        if (this.room.config.serverAsHost) {
            return this.room.actingHostIds.has(this.clientId);
        } else {
            return this.room.hostId === this.clientId;
        }
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
    RoomBeforeDestroyEvent,
    RoomCreateEvent,
    RoomDestroyEvent,
    RoomGameEndEvent,
    RoomGameStartEvent,
    RoomSelectHostEvent
]>;

export class BaseRoom extends SkeldjsStateManager<RoomEvents> {
    createdAt: number;
    connections: Map<number, Connection>;
    waitingForHost: Set<Connection>;

    playerPerspectives: Map<number, Perspective>;
    activePerspectives: Perspective[];

    actingHostsEnabled: boolean;
    actingHostIds: Set<number>;

    /**
     * This room's console logger.
     */
    logger!: winston.Logger;

    /**
     * All IP addresses banned from this room.
     */
    bannedAddresses: Set<string>;

    state: GameState;
    saahWaitingFor: PlayerData|undefined;

    loadedPlugins: Map<string, RoomPlugin>;
    chatCommandHandler: ChatCommandHandler;

    constructor(
        public readonly worker: Worker,
        public readonly config: RoomsConfig,
        settings: GameSettings
    ) {
        super({ doFixedUpdate: true });

        this.playerPerspectives = new Map;
        this.activePerspectives = [];

        this.actingHostsEnabled = true;
        this.actingHostIds = new Set;

        this.createdAt = Date.now();
        this.connections = new Map;
        this.waitingForHost = new Set;

        this.decoder.types = worker.decoder.types;

        this.bannedAddresses = new Set;
        this.settings = settings;

        this.state = GameState.NotStarted;
        this.saahWaitingFor = undefined;

        this.loadedPlugins = new Map;
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
            if (this.config.serverAsHost && this.saahWaitingFor === ev.player) {
                for (const actingHostId of this.actingHostIds) {
                    const actingHostConn = this.connections.get(actingHostId);
                    if (actingHostConn) {
                        await this.updateHost(actingHostId, actingHostConn);
                    }
                }
                this.saahWaitingFor = undefined;
            }
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

    get host(): PlayerData<this>|undefined {
        if (this.config.serverAsHost) {
            return this.players.get(this.actingHostIds[Symbol.iterator]().next().value);
        }

        return this.players.get(this.hostId);
    }

    get actingHosts() {
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

    get roomName() {
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
        if (this.hostIsMe) {
            if (this.state === GameState.Started) {
                await this.checkForGameEnd();
            }
        }

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
                            new DataMessage(component.netId, writer.buffer)
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

        if (!ev.canceled && this.stream.length) {
            const stream = this.stream;
            this.stream = [];
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

    async setHost(playerResolvable: PlayerDataResolvable) {
        if (this.config.serverAsHost)
            throw new Error("Cannot set setHost while in SaaH mode, use addActingHost and removeActingHost");

        const resolvedId = this.resolvePlayerClientID(playerResolvable);

        if (!resolvedId)
            return;

        const remote = this.connections.get(resolvedId);

        if (!remote)
            throw new Error("Cannot set host without a connection");

        if (this.actingHostIds.has(resolvedId))
            return;

        this.hostId = resolvedId;

        const player = this.players.get(resolvedId);
        if (player) {
            await player.emit(new PlayerSetHostEvent(this, player));
        }

        if (this.state === GameState.Ended && this.waitingForHost.has(remote)) {
            this.state = GameState.NotStarted;
            await this._joinOtherClients();
        }
    }

    async setSaaHEnabled(saahEnabled: boolean) {
        this.config.serverAsHost = saahEnabled;
        if (saahEnabled) {
            this.hostId = SpecialClientId.Server;
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
                if (player) {
                    await player.emit(new PlayerSetHostEvent(this, player));
                }

                if (this.state === GameState.Ended && this.waitingForHost.has(ev.alteredSelected)) {
                    this.state = GameState.NotStarted;
                    await this._joinOtherClients();
                }
            }
            await this.updateHost(connection.clientId);
            this.actingHostIds.clear();
        }
    }

    /**
     * Add another acting host to a Server-As-A-Host room.
     * @param player The player to make host.
     */
    async addActingHost(player: PlayerData<this>|Connection) {
        if (!this.config.serverAsHost)
            throw new Error("Cannot add extra actor hosts to a non-server-as-a-host room!");

        this.actingHostIds.add(player.clientId);

        const connection = player instanceof Connection ? player : this.connections.get(player.clientId);

        if (connection && this.saahWaitingFor === undefined) {
            await this.updateHost(player.clientId, connection);
        }
    }

    /**
     * Remove an acting host from a Server-As-A-Host room.
     * @param player The player to remove as host.
     */
    async removeActingHost(player: PlayerData<this>|Connection) {
        if (!this.config.serverAsHost)
            throw new Error("Cannot remove actor host from a non-server-as-a-host room!");

        this.actingHostIds.delete(player.clientId);

        const connection = player instanceof Connection ? player : this.connections.get(player.clientId);

        if (connection) {
            await this.updateHost(SpecialClientId.Server, connection);
        }
    }

    async disableActingHosts() {
        if (!this.config.serverAsHost)
            throw new Error("Cannot disable actor hosts in a non-server-as-a-host room!");

        for (const actingHostId of this.actingHostIds) {
            const connection = this.connections.get(actingHostId);
            if (connection) {
                await this.updateHost(SpecialClientId.Server, connection);
            }
        }
    }

    async enableActingHosts() {
        if (!this.config.serverAsHost)
            throw new Error("Cannot disable actor hosts in a non-server-as-a-host room!");
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


        if (this.hostIsMe) {
            if (!this.lobbyBehaviour && this.state === GameState.NotStarted) {
                this.spawnPrefab(SpawnType.LobbyBehaviour, -2);
            }

            if (!this.gameData) {
                this.spawnPrefab(SpawnType.GameData, -2);
            }
        }

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
                this.hostId = joiningPlayer.clientId; // set host manually as the connection has not been created yet
                await joiningPlayer.emit(new PlayerSetHostEvent(this, joiningPlayer));
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
                                        this.actingHostIds.has(clientId)
                                            ? clientId
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
                                        this.actingHostIds.has(clientId)
                                            ? clientId
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

        this.saahWaitingFor = joiningPlayer;

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

        await this.broadcastMessages([], [
            new JoinGameMessage(
                this.code,
                joiningClient.clientId,
                this.hostId
            )
        ]);

        this.connections.set(joiningClient.clientId, joiningClient);

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
    }

    async handleRemoteLeave(leavingConnection: Connection, reason: DisconnectReason = DisconnectReason.None) {
        await this.handleLeave(leavingConnection.clientId);

        this.waitingForHost.delete(leavingConnection);
        this.connections.delete(leavingConnection.clientId);

        if (this.players.size === 0) {
            await this.destroy();
            return;
        }

        if (this.config.serverAsHost) {
            if (this.actingHostIds.has(leavingConnection.clientId)) {
                this.actingHostIds.delete(leavingConnection.clientId);

                if (this.actingHostIds.size === 0) {
                    const newHostConn = [...this.connections.values()][0];
                    const ev = await this.emit(new RoomSelectHostEvent(this, true, false, newHostConn));

                    if (!ev.canceled) {
                        await this.addActingHost(ev.alteredSelected);
                    }
                }
            }
        } else {
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

        if (this.config.serverAsHost) {
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
                                SpecialClientId.Server
                            )
                        ]
                    )
                ));
            }
            await Promise.all(promises);
        } else {
            await this.broadcastMessages([], [
                new RemovePlayerMessage(
                    this.code,
                    leavingConnection.clientId,
                    reason,
                    this.hostId
                )
            ]);
        }

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
                                        this.actingHostIds.has(clientId)
                                            ? clientId
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
        if (this.config.serverAsHost) {
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
            if (this.config.serverAsHost) {
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
                this.despawnComponent(
                    this.lobbyBehaviour
                );

            const ship_prefabs = [
                SpawnType.ShipStatus,
                SpawnType.Headquarters,
                SpawnType.PlanetMap,
                SpawnType.AprilShipStatus,
                SpawnType.Airship
            ];

            this.spawnPrefab(ship_prefabs[this.settings?.map] || 0, -2);
            await this.shipStatus?.selectImpostors();

            for (const [, player] of this.players) {
                this.gameData?.setTasks(player, [1, 2, 3]);
            }
        }
    }

    async startGame() {
        await this.handleStart();
    }

    async handleEnd(reason: GameOverReason) {
        const waiting = this.waitingForHost;
        this.waitingForHost = new Set;
        this.state = GameState.Ended;

        const ev = await this.emit(new RoomGameEndEvent(this, reason));

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
    }

    private getOtherPlayer(base: PlayerData) {
        for (const [ , player ] of this.players) {
            if (player.info && player.control && base !== player) {
                return player;
            }
        }

        return undefined;
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
    async sendChat(message: string, options: Partial<SendChatOptions> = {}): Promise<void> {
        if (!this.gameData)
            throw new TypeError("No gamedata spawned.");

        const defaultOptions: SendChatOptions = {
            side: MessageSide.Left,
            target: undefined,
            name: "<color=yellow>[Server]</color>",
            color: Color.Yellow,
            ...options
        };

        if (defaultOptions.side === MessageSide.Left) {
            for (const [ , player ] of (defaultOptions.target ? [[ undefined, defaultOptions.target ]] as [[void, PlayerData]] : this.players)) {
                const otherPlayer = this.getOtherPlayer(player);

                if (!otherPlayer) {
                    return this.sendChat(message, { ...defaultOptions, side: MessageSide.Right });
                }

                const pcNetId = otherPlayer.control!.netId;
                const oldName = otherPlayer.info!.name;
                const oldColor = otherPlayer.info!.color;

                if (pcNetId === undefined) {
                    return;
                }

                await this.broadcast([
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
                    new RpcMessage(
                        pcNetId,
                        new SetNameMessage(oldName)
                    ),
                    new RpcMessage(
                        pcNetId,
                        new SetColorMessage(oldColor)
                    ),
                ], true, defaultOptions.target);
            }
        } else {
            // Super dumb way of doing the same thing for a single player if specified, or all players if one isn't specified
            for (const [ , player ] of (defaultOptions.target ? [[ undefined, defaultOptions.target ]] as [[void, PlayerData]] : this.players)) {
                if (!player.control)
                    continue;

                if (!player.info)
                    continue;

                const oldName = player.info.name;
                const oldColor = player.info.color;
                await this.broadcast([
                    new RpcMessage(
                        player.control.netId,
                        new SetNameMessage(defaultOptions.name)
                    ),
                    new RpcMessage(
                        player.control.netId,
                        new SetColorMessage(defaultOptions.color)
                    ),
                    new RpcMessage(
                        player.control.netId,
                        new SendChatMessage(message)
                    ),
                    new RpcMessage(
                        player.control.netId,
                        new SetNameMessage(oldName)
                    ),
                    new RpcMessage(
                        player.control.netId,
                        new SetColorMessage(oldColor)
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
