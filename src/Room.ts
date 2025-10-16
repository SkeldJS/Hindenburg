import chalk from "chalk";
import * as util from "util";

import {
    AlterGameTag,
    Color,
    DisconnectReason,
    GameDataMessageTag,
    GameMap,
    GameOverReason,
    GameState,
    Hat,
    Platform,
    RpcMessageTag,
    Skin,
    SpawnFlag,
    SpawnType,
    SystemType,
    Visor
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
    JoinedGameMessage,
    PlatformSpecificData,
    PlayerJoinData,
    ReadyMessage,
    ReliablePacket,
    RemoveGameMessage,
    RpcMessage,
    S2CHostGameMessage,
    S2CJoinGameMessage,
    S2CRemovePlayerMessage,
    SceneChangeMessage,
    SendChatMessage,
    SetColorMessage,
    SetHatMessage,
    SetNameMessage,
    SetSkinMessage,
    SetVisorMessage,
    SpawnMessage,
    StartGameMessage,
    UnknownGameDataMessage,
    UnknownRpcMessage,
    UnreliablePacket,
    WaitForHostMessage
} from "@skeldjs/protocol";

import {
    CustomNetworkTransform,
    EndGameIntent,
    StatefulRoom,
    StatefulRoomEvents,
    NetworkedObject,
    PlayerControl,
    Player,
    PlayerResolvable,
    PlayerJoinEvent,
    PlayerSceneChangeEvent,
    PlayerSetAuthoritativeEvent,
    RoomEndGameIntentEvent,
    RoomFixedUpdateEvent,
    SpecialOwnerId,
    ColorCodes,
    NetworkedPlayerInfo,
    MeetingHud
} from "@skeldjs/core";

import { BasicEvent, ExtractEventTypes } from "@skeldjs/events";
import { HazelReader, HazelWriter, Vector2 } from "@skeldjs/hazel";
import { RoomCode } from "@skeldjs/client";

import {
    ClientLeaveEvent,
    ClientBroadcastEvent,
    RoomBeforeDestroyEvent,
    RoomCreateEvent,
    RoomDestroyEvent,
    RoomGameEndEvent,
    RoomGameStartEvent,
    RoomSelectHostEvent,
    getPluginEventListeners,
    EventTarget as EventTarget
} from "./api";

import {
    CommandCallError,
    ChatCommandContext,
    RoomPlugin,
    ChatCommandHandler,
    WorkerPlugin,
    LoadedPlugin
} from "./handlers";

import { UnknownComponent } from "./components";

import { fmtConfigurableLog } from "./util/fmtLogFormat";
import { Logger } from "./Logger";

import { Connection, logLanguages, logPlatforms } from "./Connection";
import { LoggingConfig, RoomsConfig, WaterwayServer } from "./WaterwayServer";

function getPlayerChalkColor(config: LoggingConfig, player: Player<Room>): chalk.Chalk {
    if (!config.playerColors) return chalk.cyan;

    const playerInfo = player.getPlayerInfo();
    if (!playerInfo || !playerInfo.currentOutfit) return chalk.gray;
    return chalk.rgb(...ColorCodes[playerInfo.currentOutfit.color].highlightRGB as [number, number, number]);
}

Object.defineProperty(Player.prototype, Symbol.for("nodejs.util.inspect.custom"), {
    value(this: Player<Room>) {
        const connection = this.room.connections.get(this.clientId);

        const isHost = this.room.authorityId === this.clientId;
        const isActingHost = connection && this.room.actingHosts.has(connection);

        const paren = fmtConfigurableLog(
            this.room.server.config.logging.players?.format || ["id", "ping", "ishost"],
            {
                id: this.clientId,
                ping: connection ? connection.roundTripPing + "ms" : undefined,
                level: connection ? "level " + connection.playerLevel : undefined,
                ishost: isHost ? "host" : isActingHost ? "acting host" : undefined,
                platform: connection ? (logPlatforms as any)[connection.platform.platformTag] : undefined,
                language: connection ? (logLanguages as any)[connection.language] : undefined
            }
        );


        return getPlayerChalkColor(this.room.server.config.logging, this)(this.username || "<No Name>")
            + (paren ? " " + chalk.grey("(" + paren + ")") : "");
    }
});

Object.defineProperty(Player.prototype, "isHost", {
    get(this: Player<Room>) {
        return this.room.authorityId === this.clientId;
    }
});

Object.defineProperty(RoomCode.prototype, Symbol.for("nodejs.util.inspect.custom"), {
    value(this: RoomCode) {
        return chalk.yellow(this.toString());
    }
});

export enum SpecialClientId {
    Nil = 2 ** 31 - 1,
    ServerAuthority = 2 ** 31 - 2,
    Temp = 2 ** 31 - 3
}

export const logMaps = {
    [GameMap.TheSkeld]: "the skeld",
    [GameMap.MiraHQ]: "mira hq",
    [GameMap.Polus]: "polus",
    [GameMap.AprilFoolsTheSkeld]: "skeld april fools",
    [GameMap.Airship]: "airship",
    [GameMap.Fungle]: "fungle",
};

export enum MessageSide {
    Left,
    Right
}

/**
 * Options regarding sending a chat message into the room as the server, see
 * {@link Room.sendChat}
 */
export type SendChatOptions = {
    /**
     * The side of the chat box for the message to appear on for each player. Can only
     * send on the left side if there are at least 2 players in the room.
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
     *     targets: [ ev.room.host ]
     *   });
     * }
     * ```
     */
    targets: Player<Room>[] | undefined;
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
    /**
     * The skin that the player should be wearing in the chat message.
     * @example
     * ```ts
     * ev.room.sendChat("looking for salvation in a secular age", {
     *   name: "the 1975",
     *   skinId: Skin.Prisoner
     * })
     * ```
     */
    skinId: string;
    /**
     * The hat that the player should be wearing in the chat message.
     * @example
     * ```ts
     * ev.room.sendChat("I'm a cowboy baby", {
     *   name: "Cowboy",
     *   hatId: Hat.TenGallonHat
     * })
     * ```
     */
    hatId: string;
    /**
     * The visor that the player should be wearing in the chat message.
     * @example
     * ```ts
     * ev.room.sendChat("wondering how I got this far", {
     *   name: "scruffpuppie",
     *   visorId: Hat.PolusIce
     * })
     * ```
     */
    visorId: string;
}

export enum RoomPrivacy {
    Public,
    Private,
}

export type RoomEvents = StatefulRoomEvents<Room> & ExtractEventTypes<[
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

export class Room extends StatefulRoom<RoomEvents> {
    /**
     * The unix (milliseconds) timestamp. that the room was created.
     */
    createdAt: number;

    protected playerJoinedFlag: boolean;
    /**
     * All connections in the room, mapped by client ID to connection object.
     */
    connections: Map<number, Connection>;
    /**
     * The connections/players that are waiting for the host to join back.
     */
    waitingForHost: Set<Connection>;
    /**
     * A map of objects to their respective perspective owner.
     */
    ownershipGuards: Map<number, Room>;
    /**
     * This room's console logger.
     */
    logger: Logger;
    /**
     * All IP addresses banned from this room.
     */
    bannedAddresses: Set<string>;
    /**
     * All plugins loaded and scoped to the worker when this room was created, mapped by plugin id to worker plugin object.
     */
    workerPlugins: Map<string, LoadedPlugin<typeof WorkerPlugin>>;
    /**
     * All plugins loaded and scoped to the room, mapped by plugin id to room plugin object.
     */
    loadedPlugins: Map<string, LoadedPlugin<typeof RoomPlugin>>;
    /**
     * The chat command handler in the room.
     */
    chatCommandHandler: ChatCommandHandler;
    /**
     * Which clients are acting as hosts, regardless of who is actualyl in authority.
     */
    actingHosts: Set<Connection>;

    privacy: RoomPrivacy;

    protected roomNameOverride: string;
    protected eventTargets: EventTarget[];

    constructor(
        /**
         * The worker that instantiated this object.
         */
        public readonly server: WaterwayServer,
        public code: RoomCode,
        /**
         * The config for the room, the worker uses the worker's {@link WaterwayConfig.rooms} config to initialise it as.
         */
        public readonly config: RoomsConfig,
        /**
         * The game settings for the room.
         */
        settings: GameSettings,
        public readonly createdBy: Connection | undefined
    ) {
        super({ doFixedUpdate: true });

        this.ownershipGuards = new Map;

        this.createdAt = Date.now();

        this.playerJoinedFlag = false;

        this.connections = new Map;
        this.waitingForHost = new Set;

        this.bannedAddresses = new Set;
        this.settings = settings;

        this.gameState = GameState.NotStarted;

        this.workerPlugins = new Map;
        this.loadedPlugins = new Map;
        this.chatCommandHandler = new ChatCommandHandler(this);

        this.roomNameOverride = "";
        this.eventTargets = [];

        this.lastNetId = 100000;

        this.authorityId = this.config.authoritativeServer ? SpecialClientId.ServerAuthority : 0;
        this.actingHosts = new Set;

        this.privacy = RoomPrivacy.Private;

        this.logger = new Logger(() => util.inspect(this.code, true, null, true), this.server.vorpal);

        this.on("player.setname", async ev => {
            if (ev.oldName) {
                this.logger.info("%s changed their name from %s to %s",
                    ev.player, this.formatName(ev.oldName), this.formatName(ev.newName));
            } else {
                this.logger.info("%s set their name to %s",
                    ev.player, this.formatName(ev.newName));
            }
        });

        this.on("player.chat", async ev => {
            this.logger.info("%s sent message: %s",
                ev.player, chalk.red(ev.chatMessage));

            const prefix = typeof this.config.chatCommands === "object"
                ? this.config.chatCommands.prefix || "/"
                : "/";

            if (this.config.chatCommands && ev.chatMessage.startsWith(prefix)) {
                const restMessage = ev.chatMessage.substring(prefix.length);
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

        // We have to update the client's host here because if we do it too soon, the client will take
        // control of spawning the lobby and players. This is the last RPC that the client reliably sends
        // after joining.
        //
        // Technically this is a bit of a hack, since clients can choose not to send this RPC. Perhaps
        // there is a better way?
        // Look into: despawn all objects created by the acting host
        this.on("player.setlevel", async ev => {
            const connection = this.getConnection(ev.player);
            if (!connection) return;
            await this.updateAuthorityForClient(this.getClientAwareAuthorityId(connection), connection);
        });

        this.on("player.syncsettings", async ev => {
            if (this.config.enforceSettings) {
                ev.setSettings(this.config.enforceSettings);
            }
            this.logger.info("settings updated");
        });

        this.on("player.startmeeting", ev => {
            if (ev.body === "emergency") {
                this.logger.info("Meeting started (emergency meeting)");
            } else {
                this.logger.info("Meeting started (%s's body was reported)", ev.body);
            }
        });
    }

    protected _reset() {
        this.players.clear();
        this.networkedObjects.clear();
        this.messageStream = [];
        this.authorityId = 0;
        this.settings = new GameSettings;
        this.startGameCounter = -1;
        this.privacy = RoomPrivacy.Private;
    }

    async emit<Event extends RoomEvents[keyof RoomEvents]>(
        event: Event
    ): Promise<Event>;
    async emit<Event extends BasicEvent>(event: Event): Promise<Event>;
    async emit<Event extends BasicEvent>(event: Event): Promise<Event> {
        const ev = await this.server.emit(event);

        if ((ev as any).canceled || (ev as any).reverted) {
            return ev;
        }

        return super.emit(event);
    }

    async emitSerial<Event extends RoomEvents[keyof RoomEvents]>(
        event: Event
    ): Promise<Event>;
    async emitSerial<Event extends BasicEvent>(event: Event): Promise<Event>;
    async emitSerial<Event extends BasicEvent>(event: Event): Promise<Event> {
        const ev = await this.server.emitSerial(event);

        if ((ev as any).canceled || (ev as any).reverted) {
            return ev;
        }

        return super.emitSerial(event);
    }

    emitSync<Event extends RoomEvents[keyof RoomEvents]>(event: Event): Event;
    emitSync<Event extends BasicEvent>(event: Event): Event;
    emitSync<Event extends BasicEvent>(event: Event): Event {
        const ev = this.server.emitSync(event);

        if ((ev as any).canceled || (ev as any).reverted) {
            return ev;
        }

        return super.emitSync(event);
    }

    [Symbol.for("nodejs.util.inspect.custom")]() {
        const paren = fmtConfigurableLog(
            this.server.config.logging.rooms?.format || ["players", "map", "host", "privacy"],
            {
                players: this.players.size + "/" + this.settings.maxPlayers + " players",
                map: logMaps[this.settings.map],
                host: this.config.authoritativeServer ? "server-authority" : this.playerAuthority || "no host",
                privacy: this.privacy
            }
        );

        return util.inspect(this.code, true, null, true)
            + (paren ? " " + chalk.grey("(" + paren + ")") : "");
    }

    formatName(name: string) {
        return name.replace(/\n/g, "\\n");
    }

    get playerAuthority(): Player<this> | undefined {
        return this.players.get(this.authorityId);
    }

    get isAuthoritative() {
        return this.config.authoritativeServer;
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

        const hostConnection = this.playerAuthority ? this.connections.get(this.playerAuthority.clientId) : undefined;

        return hostConnection?.username || this.code.toString();
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

        await this.broadcastImmediate([], [
            new RemoveGameMessage(reason)
        ]);

        this.gameState = GameState.Destroyed;
        this.server.rooms.delete(this.code.id);

        this.emit(new RoomDestroyEvent(this));

        for (const eventTarget of this.eventTargets) {
            this.removeEventTarget(eventTarget);
        }

        this.logger.info("Room was destroyed (%s).", DisconnectReason[reason]);
    }

    async processFixedUpdate() {
        const curTime = Date.now();
        const delta = curTime - this.lastFixedUpdateTimestamp;

        if (this.config.createTimeout > 0 && curTime - this.createdAt > this.config.createTimeout * 1000 && !this.playerJoinedFlag) {
            this.destroy(DisconnectReason.ServerRequest);
            this.playerJoinedFlag = true;
        }

        this.lastFixedUpdateTimestamp = Date.now();

        for (const [, component] of this.networkedObjects) {
            if (!component)
                continue;

            await component.processFixedUpdate(delta / 1000);

            if (component.dirtyBit <= 0)
                continue;

            const writer = HazelWriter.alloc(1024);
            if (component.serializeToWriter(writer, false)) {
                writer.realloc(writer.cursor);
                this.messageStream.push(new DataMessage(component.netId, writer.buffer));
            }
            component.dirtyBit = 0;
        }

        if (this.endGameIntents.length) {
            const endGameIntents = this.endGameIntents;
            this.endGameIntents = [];
            if (this.isAuthoritative) {
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
                delta,
            )
        );

        if (!ev.canceled && this.messageStream.length) {
            await this.flushMessages();
        }
    }

    async flushMessages() {
        if (this.messageStream.length > 0) {
            const stream = this.messageStream;
            this.messageStream = [];
            await this.broadcastImmediate(stream);
        }
    }

    spawnComponent(component: NetworkedObject<this>): void {
        if (!this.getOwnerOf(component))
            this.guardObjectAsOwner(component);
        super.spawnComponent(component);
    }

    despawnComponent(component: NetworkedObject<this>): void {
        if (this.canManageObject(component))
            this.disownObject(component);

        super.despawnComponent(component);
    }

    getServerOwnedObjectSpawn() {
        return this.objectList
            .filter(object => object.ownerId === SpecialOwnerId.Server)
            .map(object => this.createObjectSpawnMessage(object));
    }

    async createPlayerInfo(player: Player<this>) {
        const playerInfo = await this.createObjectOfType(SpawnType.PlayerInfo, SpecialOwnerId.Server, SpawnFlag.None) as NetworkedPlayerInfo<this>;
        playerInfo.playerId = this.getAvailablePlayerID();
        playerInfo.clientId = player.clientId;
        playerInfo.friendCode = player.friendCode;
        playerInfo.puid = player.puid;
        await playerInfo.processAwake();
        this.broadcastLazy(this.createObjectSpawnMessage(playerInfo));
        this.playerInfo.set(playerInfo.playerId, playerInfo);
        return playerInfo;
    }

    /**
     * Get all real client-server connections for a list of players. That is, connections for
     * all players that are being controlled by a remote client/real player.
     *
     * See {@link Room.getConnections} to get connections for a list of players and
     * returned in the same order & place as the players provided, although some connections
     * may not exist, resulting in `undefined`s.
     * @param players The list of players to get connections for.
     * @returns All real connections for the players provided.
     */
    getRealConnections(players: PlayerResolvable[]) {
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
    getConnections(players: PlayerResolvable[]) {
        return players.map(player => this.getConnection(player));
    }

    /**
     * Get the client-server connection of a player.
     * @returns The connection of the player, or undefined if they only exist on the server.
     */
    getConnection(player: PlayerResolvable) {
        const clientId = this.resolvePlayerClientID(player);

        if (!clientId)
            return undefined;

        return this.connections.get(clientId);
    }

    /**
     * Ban player from a room
     * @param connection The connection or the player that should be banned.
     * @param messages The messages in that the banned player gets displayed.
     */
    banPlayer(connection: Connection | Player<this>, message?: string): void {
        if (connection instanceof Player) {
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
    

    async handleEndGameMessage(message: EndGameMessage) {
        await this.endGame(message.reason);
    }

    async handleStartGameMessage(message: StartGameMessage, senderPlayer: Player<Room>) {
        await this.handleStartGame(senderPlayer);
    }

    async handleAlterGameMessage(message: AlterGameMessage) {
        if (message.alterTag === AlterGameTag.ChangePrivacy) {
            // const messagePrivacy = message.value ? "public" : "private";
            // const oldPrivacy = this.privacy;
            // TODO: privacy event again
            // const ev = await this.emit(
            //     new RoomSetPrivacyEvent(
            //         this,
            //         message,
            //         oldPrivacy,
            //         messagePrivacy
            //     )
            // );

            // if (ev.alteredPrivacy !== messagePrivacy) {
            //     await this.broadcastImmediate([], [
            //         new AlterGameMessage(
            //             this.code,
            //             AlterGameTag.ChangePrivacy,
            //             ev.alteredPrivacy === "public" ? 1 : 0
            //         )
            //     ]);
            // }
            
            await this.broadcastImmediate([], [
                new AlterGameMessage(
                    this.code.id,
                    AlterGameTag.ChangePrivacy,
                    message.value,
                )
            ]);

            this.privacy = message.value === 1 ? RoomPrivacy.Public : RoomPrivacy.Private;

            // if (ev.alteredPrivacy !== oldPrivacy) {
            //     this._setPrivacy(ev.alteredPrivacy);
            // }
        } else {
            this.logger.error("Unknown alter game tag: %s with value %s", message.alterTag, message.value);
        }
    }

    async handleDataMessage(message: DataMessage, senderPlayer: Player<Room>) {
        const component = this.networkedObjects.get(message.netId);

        if (component) {
            const reader = HazelReader.from(message.data);
            component.deserializeFromReader(reader, false);
        }
        return true;
    }

    async handleRpcMessage(message: RpcMessage, senderPlayer: Player<Room>) {
        const component = this.networkedObjects.get(message.netId);

        if (component) {
            try {
                if (message.child instanceof UnknownRpcMessage) {
                    const parsedRpc = component.parseRemoteCall(message.child.messageTag, message.child.dataReader);
                    if (!parsedRpc) {
                        this.logger.error("Unknown remote procedure call from player %s (net id %s, %s): message tag %s",
                            senderPlayer, component.netId, SpawnType[component.spawnType] || "Unknown", RpcMessageTag[message.child.messageTag] || message.child.messageTag);
                        return this.server.config.socket.acceptUnknownGameData;
                    }
                    await component.handleRemoteCall(parsedRpc);
                } else {
                    await component.handleRemoteCall(message.child);
                }
            } catch (e) {
                this.logger.error("Could not process remote procedure call from player %s (net id %s, %s): %s",
                    senderPlayer, component.netId, SpawnType[component.spawnType] || "Unknown", e);
                return false;
            }
        } else {
            this.logger.warn("Got remote procedure call for non-existent component: net id %s", message.netId);
        }
        return true;
    }

    async handleSpawnMessage(message: SpawnMessage, senderPlayer: Player<Room>) {
        const ownerClient = this.players.get(message.ownerId);

        if (message.ownerId > 0 && !ownerClient)
            return;

        if (this.config.advanced.unknownObjects === "all") {
            await this.createUnknownPrefab(message.spawnType, message.ownerId, message.flags, message.components);
            return true;
        }

        if (
            Array.isArray(this.config.advanced.unknownObjects)
            && (
                this.config.advanced.unknownObjects.includes(message.spawnType) ||
                this.config.advanced.unknownObjects.includes(SpawnType[message.spawnType])
            )) {
            await this.createUnknownPrefab(message.spawnType, message.ownerId, message.flags, message.components);
            return true;
        }

        const registeredPrefab = this.registeredPrefabs.get(message.spawnType);

        if (!registeredPrefab) {
            if (this.config.advanced.unknownObjects === true) {
                return await this.createUnknownPrefab(message.spawnType, message.ownerId, message.flags, message.components);
            }

            this.logger.error("Couldn't spawn object of type: %s with %s component%s (not registered, you might need to add this to config.rooms.advanced.unknownObjects)",
                message.spawnType, message.components.length, message.components.length === 1 ? "" : "s");
            return false;
        }

        if (registeredPrefab.length !== message.components.length) {
            this.logger.error("Couldn't spawn object type %s with %s component%s, prefab expected %s component%s",
                message.spawnType, message.components.length, message.components.length === 1 ? "" : "s", registeredPrefab.length, registeredPrefab.length === 1 ? "" : "s");
            return false;
        }

        try {
            const object = await this.createObjectWithNetIds(
                message.spawnType,
                registeredPrefab,
                message.ownerId,
                message.flags,
                message.components.map(x => x.netId),
            );
            for (let i = 0; i < message.components.length; i++) {
                object.components[i].deserializeFromReader(HazelReader.from(message.components[i].data), true);
            }
        } catch (e) {
            this.logger.error("Couldn't spawn object of type: %s with %s component%s (you might need to add it to config.rooms.advanced.unknownObjects)",
                message.spawnType, message.components.length, message.components.length === 1 ? "" : "s");
            throw e;
        }
        return true;
    }

    async handleDespawnMessage(message: DespawnMessage) {
        const component = this.networkedObjects.get(message.netId);

        if (component) {
            this._despawnComponent(component);
        }
        return true;
    }

    async handleSceneChangeMessage(message: SceneChangeMessage) {
        const player = this.players.get(message.clientId);

        if (player) {
            if (message.scene === "OnlineGame") {
                const connection = this.getConnection(player);

                if (!connection) return;

                player.inScene = true;

                const ev = await this.emit(
                    new PlayerSceneChangeEvent(
                        this,
                        player,
                        message
                    )
                );

                if (ev.canceled) {
                    player.inScene = false;
                    return;
                }

                if (this.isAuthoritative) {
                    await this.broadcastImmediate(
                        this.getExistingObjectSpawn(),
                        undefined,
                        [player]
                    );
                } else {
                    await this.broadcastImmediate(
                        this.getServerOwnedObjectSpawn(),
                        undefined,
                        [player],
                    );
                }

                const playerInfo = await this.createPlayerInfo(player);

                if (this.isAuthoritative) {
                    await this.spawnNecessaryObjects();

                    const playerControl = await this.createObjectOfType(SpawnType.Player, player.clientId, SpawnFlag.IsClientCharacter) as PlayerControl<this>;
                    playerControl.playerId = playerInfo.playerId;
                    await playerControl.processAwake();
                    this.broadcastLazy(this.createObjectSpawnMessage(playerControl));

                    if (this.playerAuthority && this.playerAuthority.clientId !== message.clientId) {
                        this.playerAuthority?.characterControl?.syncSettings(this.settings);
                    }
                } else {
                    this.broadcastLazy(this.createObjectSpawnMessage(playerInfo));
                }
            }
        }

        // SceneChange is broadcasted to all players by the joining player. If we're the server, we want to
        // cancel this and stop it from being broadcasted so that we can spawn the player ourselves.
        return !this.isAuthoritative;
    }

    async handleReadyMessage(message: ReadyMessage) {
        const player = this.players.get(message.clientId);

        if (player) {
            player.setReady();
        }
        return true;
    }

    parseGameDataMessage(messageTag: GameDataMessageTag, dataReader: HazelReader) {
        switch (messageTag as GameDataMessageTag) {
            case GameDataMessageTag.Data: return DataMessage.deserializeFromReader(dataReader);
            case GameDataMessageTag.Rpc: return RpcMessage.deserializeFromReader(dataReader);
            case GameDataMessageTag.Spawn: return SpawnMessage.deserializeFromReader(dataReader);
            case GameDataMessageTag.Despawn: return DespawnMessage.deserializeFromReader(dataReader);
            case GameDataMessageTag.SceneChange: return SceneChangeMessage.deserializeFromReader(dataReader);
            case GameDataMessageTag.Ready: return ReadyMessage.deserializeFromReader(dataReader);
            case GameDataMessageTag.ChangeSettings:
            case GameDataMessageTag.ClientInfo:
            default:
                return undefined;
        }
    }

    async handleGameDataMessage(message: BaseGameDataMessage, senderPlayer: Player<Room>) {
        if (message instanceof DataMessage) return await this.handleDataMessage(message, senderPlayer);
        if (message instanceof RpcMessage) return await this.handleRpcMessage(message, senderPlayer);
        if (message instanceof SpawnMessage) return await this.handleSpawnMessage(message, senderPlayer);
        if (message instanceof DespawnMessage) return await this.handleDespawnMessage(message);
        if (message instanceof SceneChangeMessage) return await this.handleSceneChangeMessage(message);
        if (message instanceof ReadyMessage) return await this.handleReadyMessage(message);

        this.logger.error("Unknown game data message to handle, with tag %s",
            GameDataMessageTag[message.messageTag] || message.messageTag);
        return this.server.config.socket.acceptUnknownGameData;
    }

    protected async handleGameDataMessageUnknown(message: BaseGameDataMessage, senderPlayer: Player<Room>) {
        if (message instanceof UnknownGameDataMessage) {
            const parsedMessage = this.parseGameDataMessage(message.messageTag, message.dataReader);
            return await this.handleGameDataMessage(parsedMessage || message, senderPlayer);
        }
        return await this.handleGameDataMessage(message, senderPlayer);
    }

    async handleMessagesAndGetNotCanceled(messages: BaseGameDataMessage[], senderPlayer: Player<Room>): Promise<BaseGameDataMessage[]> {
        const notCanceled = [];
        for (const message of messages) {
            const doBroadcast = await this.handleGameDataMessageUnknown(message, senderPlayer);
            if (doBroadcast) notCanceled.push(message);
        }
        return notCanceled;
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

        if (clientsToBroadcast.length === 1) {
            const singleClient = clientsToBroadcast[0];

            if (!singleClient)
                return;

            if (clientsToExclude.has(singleClient))
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
                                this.code.id,
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
                                    this.code.id,
                                    connection.clientId,
                                    ev.alteredGameData
                                )
                                : new GameDataMessage(
                                    this.code.id,
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

    async broadcastMovement(component: CustomNetworkTransform<this>, data: Buffer) {
        const sender = component.player;
        const movementPacket = new UnreliablePacket(
            [
                new GameDataMessage(
                    this.code.id,
                    [
                        new DataMessage(
                            component.netId,
                            data
                        )
                    ]
                )
            ]
        );

        if (this.server.config.optimizations.movement.updateRate > 1) {
            const velx = data.readUInt16LE(6);
            const vely = data.readUInt16LE(8);
            const velocity = new Vector2(Vector2.lerp(velx / 65535), Vector2.lerp(vely / 65535));
            const magnitude = Vector2.null.dist(velocity);

            if (magnitude > 0.5) {
                let movementTick = (sender as any)[_movementTick] || 0;
                movementTick++;
                (sender as any)[_movementTick] = movementTick;

                if (movementTick % this.server.config.optimizations.movement.updateRate !== 0) {
                    return;
                }
            }
        }

        const writer = this.server.config.optimizations.movement.reuseBuffer
            ? HazelWriter.alloc(22)
                .uint8(0)
                .write(movementPacket)
            : undefined;

        const promises = [];

        for (const [clientId, player] of this.players) {
            const connection = this.connections.get(clientId);

            if (player === sender || !connection)
                continue;

            const playerTransform = player.characterControl?.getComponentSafe(2, CustomNetworkTransform);

            if (playerTransform && this.server.config.optimizations.movement.visionChecks) {
                const dist = component.position.dist(playerTransform.position);

                if (dist >= 7) // todo: ignore this check if the player is near the admin table
                    continue;
            }

            const playerInfo = player.getPlayerInfo();
            const senderPlayerInfo = sender.getPlayerInfo();

            if (this.server.config.optimizations.movement.deadChecks && senderPlayerInfo?.isDead && !playerInfo?.isDead)
                continue;

            if (writer) {
                promises.push(
                    this.server.sendRawPacket(
                        connection.listenSocket,
                        connection.remoteInfo,
                        writer.buffer
                    )
                );
            } else {
                promises.push(
                    this.server.sendPacket(
                        connection,
                        movementPacket
                    )
                );
            }
        }

        await Promise.all(promises);
    }

    async broadcastImmediate(
        gameData: BaseGameDataMessage[],
        payloads: BaseRootMessage[] = [],
        include?: PlayerResolvable[],
        exclude?: PlayerResolvable[],
        reliable = true
    ) {
        const includedConnections = include ? this.getRealConnections(include) : undefined;
        const excludedConnections = exclude ? this.getRealConnections(exclude) : undefined;

        this.broadcastMessages(gameData, payloads, includedConnections, excludedConnections, reliable);
    }

    async setCode(code: RoomCode): Promise<void> {
        if (this.code) {
            this.logger.info(
                "Game code changed to %s",
                code
            );
        }

        await this.broadcastImmediate([], [
            new S2CHostGameMessage(code.id)
        ]);
    }

    /**
     * Update the host for the room or for a specific client.
     * @param authorityId The host to set.
     * @param recipient The specific client recipient if required.
     */
    async updateAuthorityForClient(authorityId: number, recipient: Connection) {
        await this.broadcastMessages([], [
            new S2CJoinGameMessage(
                this.code.id,
                SpecialClientId.Temp,
                authorityId,
                "TEMP",
                new PlatformSpecificData(Platform.StandaloneSteamPC, "TESTNAME"),
                0,
                "",
                ""
            ),
            new S2CRemovePlayerMessage(
                this.code.id,
                SpecialClientId.Temp,
                DisconnectReason.Error,
                authorityId
            )
        ], [recipient]);
    }

    /**
     * Set a player authority as the actual host for the room, disabling server authority.
     * @param playerResolvable The player to set as the player authority.
     */
    async updatePlayerAuthority(playerResolvable: PlayerResolvable, removeAllActingHosts: boolean) {
        const resolvedId = this.resolvePlayerClientID(playerResolvable);

        if (!resolvedId)
            return;

        const remoteConnection = this.connections.get(resolvedId);

        if (!remoteConnection)
            throw new Error("Cannot set player authority without a connection");

        const previousAuthorityId = this.authorityId;
        this.config.authoritativeServer = false;

        await this.setPlayerAuthority(playerResolvable);

        if (previousAuthorityId === SpecialClientId.ServerAuthority) {
            this.logger.info("%s is now the player authority, the server was authoritative previously", remoteConnection);
        } else {
            const previousConnection = this.connections.get(previousAuthorityId);
            if (previousConnection) {
                this.logger.info("%s is now the player authority, the previous player authority was %s", remoteConnection, previousConnection);
            } else {
                this.logger.info("%s is now the player authority, there was no previous authoritative player", remoteConnection);
            }
        }

        if (removeAllActingHosts) {
            if (this.actingHosts.size > 0) {
                const numActingHosts = this.actingHosts.size;
                this.actingHosts.clear();
                this.logger.info("Removed %s acting host%s", numActingHosts, numActingHosts === 1 ? "" : "s");
            }
        } else {
            if (this.actingHosts.has(remoteConnection)) {
                this._removeActingHost(remoteConnection);
            }
        }


        if (this.gameState === GameState.Ended && this.waitingForHost.has(remoteConnection)) {
            this.gameState = GameState.NotStarted;
            const waitingPromises = [];
            for (const waitingClient of this.waitingForHost) {
                waitingPromises.push(this.finishJoiningGame(waitingClient));
            }
            await Promise.all(waitingPromises);
            this.waitingForHost.clear();
        }

        for (const [, connection] of this.connections) {
            await this.updateAuthorityForClient(this.getClientAwareAuthorityId(connection), connection);
        }
    }

    async setServerAuthority(requireActingHost: boolean) {
        if (this.isAuthoritative) throw new Error("Server is already authoritative");

        const connection = this.playerAuthority && this.getConnection(this.playerAuthority);
        if (requireActingHost && this.actingHosts.size === 0) {
            if (connection) {
                this._addActingHost(connection);
            } else {
                if (this.isAuthoritative && this.actingHosts.size === 0) {
                    const nextHostConnection = [...this.connections.values()][0];
                    const ev = await this.emit(new RoomSelectHostEvent(this, false, false, nextHostConnection));

                    if (!ev.canceled) {
                        this._addActingHost(ev.alteredSelected);
                    }
                }
            }
        }

        this.authorityId = SpecialClientId.ServerAuthority;
        this.config.authoritativeServer = true;

        // TODO: look at game-end scenarios?

        if (connection) {
            this.logger.info("The server is now authoritative, the previous player authority was %s", connection);
        } else {
            this.logger.info("The server is now authoritative, there was no previous authoritative player");
        }

        await this.updateAllClientAwareAuthority();
    }

    getClientAwareAuthorityId(clientPov: Connection) {
        if (this.config.authoritativeServer && this.gameState === GameState.Started) return SpecialClientId.ServerAuthority;
        if (this.actingHosts.has(clientPov)) return clientPov.clientId;
        return this.authorityId;
    }

    async updateAllClientAwareAuthority() {
        const promises = [];
        for (const [ , client ] of this.connections) {
            promises.push(this.updateAuthorityForClient(this.getClientAwareAuthorityId(client), client));
        }
        await Promise.all(promises);
    }

    protected _addActingHost(client: Connection) {
        this.actingHosts.add(client);
        this.logger.info("%s is now an acting host", client);
    }

    protected _removeActingHost(client: Connection) {
        this.actingHosts.delete(client);
        this.logger.info("%s is no longer an acting host", client);
    }

    async addActingHost(client: Connection) {
        if (this.actingHosts.has(client)) throw new Error("Client is already an acting host");
        this._addActingHost(client);
        await this.updateAuthorityForClient(this.getClientAwareAuthorityId(client), client);
    }

    async removeActingHost(client: Connection) {
        if (!this.actingHosts.has(client)) throw new Error("Client is not an acting host");
        this._removeActingHost(client);
        await this.updateAuthorityForClient(this.getClientAwareAuthorityId(client), client);
    }

    canMakeHostChanges(player: Player<this>) {
        const connection = this.getConnection(player);
        return this.authorityId === player.clientId || (connection && this.actingHosts.has(connection));
    }

    async handleJoin(joinInfo: PlayerJoinData): Promise<Player<this>> {
        const cachedPlayer = this.players.get(joinInfo.clientId);
        if (cachedPlayer)
            return cachedPlayer;

        const player = new Player(this, joinInfo.clientId, joinInfo.playerName, joinInfo.platform, joinInfo.playerLevel);
        this.players.set(joinInfo.clientId, player);

        return player;
    }

    getOtherClientJoinData(excluding: Connection) {
        const data: PlayerJoinData[] = [];
        for (const [ , client ] of this.connections) {
            if (client.clientId === excluding.clientId) continue;
            data.push(client.getJoinData());
        }
        return data;
    }

    async finishJoiningGame(joiningClient: Connection) {
        await joiningClient.sendPacket(
            new ReliablePacket(
                joiningClient.getNextNonce(),
                [
                    new JoinedGameMessage(
                        this.code.id,
                        joiningClient.clientId,
                        // For now, the authority belongs to either the actual host or the server when it comes to
                        // handling the player joining. Once they have changed scene, they will become an acting host.
                        this.authorityId,
                        this.getOtherClientJoinData(joiningClient),
                    ),
                    new AlterGameMessage(
                        this.code.id,
                        AlterGameTag.ChangePrivacy,
                        this.privacy === RoomPrivacy.Private ? 1 : 0
                    )
                ]
            )
        );
    }

    async handleRemoteJoin(joiningClient: Connection) {
        const joinData = new PlayerJoinData(
            joiningClient.clientId,
            joiningClient.username,
            joiningClient.platform,
            joiningClient.playerLevel,
            "", // todo: combine worker with matchmaker
            ""
        );

        const joiningPlayer = await this.handleJoin(joinData);

        if (!joiningPlayer) return;

        if (this.isAuthoritative) {
            if (this.actingHosts.size === 0) {
                const ev = await this.emit(new RoomSelectHostEvent(this, false, true, joiningClient));
                if (!ev.canceled) {
                    this._addActingHost(ev.alteredSelected);
                }
            }
        } else {
            if (this.authorityId === 0) {
                const ev = await this.emit(new RoomSelectHostEvent(this, false, true, joiningClient));
                if (!ev.canceled) {
                    this.authorityId = ev.alteredSelected.clientId; // set player authority manually as the connection has not been created yet
                    await joiningPlayer.emit(new PlayerSetAuthoritativeEvent(this, joiningPlayer));
                    this.logger.info("%s is now the player authority as the first player to join", joiningClient);
                }
            }
        }

        joiningClient.room = this;

        const promises = [];
        for (const [, otherClient] of this.connections) {
            promises.push(otherClient.sendPacket(
                new ReliablePacket(
                    otherClient.getNextNonce(),
                    [
                        new S2CJoinGameMessage(
                            this.code.id,
                            joiningClient.clientId,
                            this.getClientAwareAuthorityId(otherClient),
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
        await Promise.all(promises);

        if (this.gameState === GameState.Ended) {
            if (!this.isAuthoritative && joiningClient.clientId !== this.authorityId) {
                this.waitingForHost.add(joiningClient);

                await joiningClient.sendPacket(
                    new ReliablePacket(
                        joiningClient.getNextNonce(),
                        [
                            new WaitForHostMessage(
                                this.code.id,
                                joiningClient.clientId
                            )
                        ]
                    )
                );

                this.logger.info("%s joined, waiting for host",
                    joiningPlayer);
                return;
            }
        }

        this.gameState = GameState.NotStarted;

        await this.finishJoiningGame(joiningClient);

        const waitingPromises = [];
        for (const waitingClient of this.waitingForHost) {
            waitingPromises.push(this.finishJoiningGame(waitingClient));
        }
        await Promise.all(waitingPromises);
        this.waitingForHost.clear();

        if (!this.connections.has(joiningClient.clientId)) {
            this.connections.set(joiningClient.clientId, joiningClient);
        }
        this.playerJoinedFlag = true;

        await this.emit(
            new PlayerJoinEvent(
                this,
                joiningPlayer
            )
        );

        if (joiningClient.clientId === this.authorityId) {
            this.logger.info(
                "%s joined the game as the room authority",
                joiningClient
            );
        } else {
            this.logger.info(
                "%s joined the game",
                joiningClient
            );
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

        if (this.authorityId === leavingConnection.clientId) {
            const nextHostConnection = [...this.connections.values()][0];
            const ev = await this.emit(new RoomSelectHostEvent(this, false, false, nextHostConnection));

            if (!ev.canceled) {
                const player = ev.alteredSelected.getPlayer();

                if (player) {
                    await this.updatePlayerAuthority(player, false);
                }
            }
        }

        this.actingHosts.delete(leavingConnection);

        if (this.isAuthoritative && this.actingHosts.size === 0) {
            const nextHostConnection = [...this.connections.values()][0];
            const ev = await this.emit(new RoomSelectHostEvent(this, false, false, nextHostConnection));

            if (!ev.canceled) {
                this._addActingHost(ev.alteredSelected);
            }
        }

        const promises = [];
        for (const [, otherClient] of this.connections) {
            promises.push(otherClient.sendPacket(
                new ReliablePacket(
                    otherClient.getNextNonce(),
                    [
                        new S2CRemovePlayerMessage(
                            this.code.id,
                            leavingConnection.clientId,
                            reason,
                            this.getClientAwareAuthorityId(otherClient),
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

    waitingForReady(player: Player<this>): boolean {
        return super.waitingForReady(player) && this.getConnection(player) !== undefined;
    }

    async handleStartGame(startedBy?: Player<Room>) {
        this.gameState = GameState.Started;
        
        if (startedBy) {
            this.logger.info("Player %s requested game start, to be managed by %s",
                startedBy, this.isAuthoritative ? "server" : (this.playerAuthority || "unknown player"));
        } else {
            this.logger.info("Server started game start, to be managed by %s",
                this.isAuthoritative ? "server" : (this.playerAuthority || "unknown player"));
        }

        const ev = await this.emit(new RoomGameStartEvent(this, startedBy));

        if (ev.canceled) {
            this.gameState = GameState.NotStarted;
            return;
        }

        await this.broadcastImmediate([], [new StartGameMessage(this.code.id)]);

        if (this.isAuthoritative) {
            await this.updateAllClientAwareAuthority();
            await super.handleStartGame();
            this.logger.info("Game started");
        }
    }

    async startGame() {
        await this.handleStartGame(undefined);
    }

    async handleEndGame(reason: GameOverReason, intent?: EndGameIntent) {
        const ev = await this.emit(new RoomGameEndEvent(this, reason, intent));
        if (ev.canceled) return;
        
        await this.broadcastImmediate([], [new EndGameMessage(this.code.id, reason, false)]);
        await super.handleEndGame(reason);

        this.logger.info("Game ended: %s", GameOverReason[ev.reason]);
        await this.flushMessages();
        await this.updateAllClientAwareAuthority();
    }

    async endGame(reason: GameOverReason, intent?: EndGameIntent) {
        await this.handleEndGame(reason, intent);
    }

    protected async createUnknownPrefab(
        spawnType: number,
        ownerId: number,
        flags: number,
        componentsData: ComponentSpawnData[],
    ) {
        const _ownerId = ownerId === undefined || ownerId === SpecialOwnerId.Global ? this :
            typeof ownerId === "number"
                ? this.players.get(ownerId)
                : ownerId;

        const prefab = new Array(componentsData.length).fill(UnknownComponent);
        this.logger.warn("Spawning unknown prefab with spawn id %s, owned by %s, with %s component%s (flags=%s)",
            spawnType, _ownerId, componentsData, componentsData.length === 1 ? "" : "s", flags);

        const unknownObject = await this.createObjectWithNetIds(spawnType, prefab, ownerId, flags, componentsData.map(x => x.netId));
        for (let i = 0; i < componentsData.length; i++) {
            unknownObject.components[i].deserializeFromReader(HazelReader.from(componentsData[i].data), true);
        }
    }

    private getOtherPlayer(base: Player<this>) {
        for (const [, player] of this.players) {
            const playerInfo = player.getPlayerInfo();
            if (playerInfo?.defaultOutfit && playerInfo.defaultOutfit.color > -1 && player.characterControl && base !== player) {
                return player;
            }
        }

        return undefined;
    }

    private async _sendChatFor(player: Player<this>, message: string, options: SendChatOptions) {
        const sendPlayer = options.side === MessageSide.Left
            ? this.getOtherPlayer(player) || player
            : player;

        if (!sendPlayer.characterControl)
            return;

        const sendPlayerInfo = sendPlayer.getPlayerInfo();

        if (!sendPlayerInfo)
            return;

        const defaultOutfit = sendPlayerInfo.defaultOutfit;

        const oldName = defaultOutfit.name;
        const oldColor = defaultOutfit.color;
        const oldHat = defaultOutfit.hatId;
        const oldSkin = defaultOutfit.skinId;
        const oldVisor = defaultOutfit.visorId;

        await this.broadcastImmediate([
            new RpcMessage(
                sendPlayer.characterControl.netId,
                new SetNameMessage(sendPlayer.characterControl.netId, options.name)
            ),
            new RpcMessage(
                sendPlayer.characterControl.netId,
                new SetColorMessage(sendPlayer.characterControl.netId, options.color)
            ),
            new RpcMessage(
                sendPlayer.characterControl.netId,
                new SetHatMessage(options.hatId, defaultOutfit.nextHatSequenceId())
            ),
            new RpcMessage(
                sendPlayer.characterControl.netId,
                new SetSkinMessage(options.skinId, defaultOutfit.nextSkinSequenceId())
            ),
            new RpcMessage(
                sendPlayer.characterControl.netId,
                new SetVisorMessage(options.visorId, defaultOutfit.nextVisorSequenceId())
            ),
            new RpcMessage(
                sendPlayer.characterControl.netId,
                new SendChatMessage(message)
            ),
            new RpcMessage(
                sendPlayer.characterControl.netId,
                new SetNameMessage(sendPlayer.characterControl.netId, oldName)
            ),
            new RpcMessage(
                sendPlayer.characterControl.netId,
                new SetColorMessage(sendPlayer.characterControl.netId, oldColor)
            ),
            new RpcMessage(
                sendPlayer.characterControl.netId,
                new SetHatMessage(oldHat, defaultOutfit.nextHatSequenceId())
            ),
            new RpcMessage(
                sendPlayer.characterControl.netId,
                new SetSkinMessage(oldSkin, defaultOutfit.nextSkinSequenceId())
            ),
            new RpcMessage(
                sendPlayer.characterControl.netId,
                new SetVisorMessage(oldVisor, defaultOutfit.nextVisorSequenceId())
            )
        ], undefined, [player]);
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
        const colorMap = Color as any as { [key: string]: Color };

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
                promises.push(this._sendChatFor(player as Player<this>, message, defaultOptions));
            }
        } else {
            for (const [, player] of this.players) {
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
     * Clear a room name override made with {@link Room.setRoomNameOverride}.
     */
    clearRoomNameOverride() {
        this.roomNameOverride = "";
    }

    /**
     * Short-hand for removing a fake player created with {@link Room.createFakePlayer}. This will
     * despawn the player immediately.
     * @param player The fake player to remove from the game.
     * @example
     * ```ts
     * const player = room.createFakePlayer();
     *
     * ...
     *
     * room.removeFakePlayer(player);
     * ```
     */
    removeFakePlayer(player: Player<this>) {
        player.destroy();
    }

    registerEventTarget(observer: EventTarget) {
        const observerClass = Object.getPrototypeOf(observer);

        if (observerClass === null)
            throw new Error("Invalid event observer");

        const eventListeners = getPluginEventListeners(observerClass);
        for (const eventListener of eventListeners) {
            const fn = eventListener.handler.bind(observer);

            this.on(eventListener.eventName, fn);

            observer.getEventListeners().push({ eventName: eventListener.eventName, handler: fn });
        }
    }

    removeEventTarget(observer: EventTarget) {
        for (const eventHandler of observer.getEventListeners()) {
            this.off(eventHandler.eventName, eventHandler.handler);
        }
    }

    /**
     * Guard an object so that no other room (or perspective) can make changes to it.
     *
     * This is useful when perspectives create conflicts and state becomes unmanageable;
     * just assign its logic to one room.
     *
     * Note that this is only a nominal change; plugins can still make changes freely - the only
     * change is that packets won't be managed by rooms that the object does not belong to.
     * @param netObject The object to own
     */
    guardObjectAsOwner(netObject: NetworkedObject<this>) {
        if (this.ownershipGuards.has(netObject.netId))
            throw new Error("An object with the same network id is already owned; the room must disown it first");

        this.ownershipGuards.set(netObject.netId, this);
    }

    /**
     * Unknown an object so that all rooms can make changes to it.
     * @param netObject The object to disown
     */
    disownObject(netObject: NetworkedObject<this>) {
        const ownership = this.ownershipGuards.get(netObject.netId);
        if (!ownership || ownership !== this)
            throw new Error("Cannot disown object; an object with that network id isn't owned by this room");

        this.ownershipGuards.delete(netObject.netId);
    }

    /**
     * Get the owner of an object.
     * @param netObject The object to disown
     */
    getOwnerOf(netObject: NetworkedObject<this>) {
        return this.ownershipGuards.get(netObject.netId);
    }

    canManageObject(object: NetworkedObject<this>): boolean {
        const ownership = this.ownershipGuards.get(object.netId);
        return this.isAuthoritative && (!ownership || ownership === this);
    }

    // Abstract implementations

    clearMyVote(meetingHud: MeetingHud<this>): Promise<void> {
        throw new Error("Method not implemented.");
    }

    sendRepairSystem(systemType: SystemType, amount: number): Promise<void> {
        throw new Error("Method not implemented.");
    }

    getSelectedSeekerAllowed(seekerPlayerId: number): boolean {
        return this.privacy === RoomPrivacy.Private;
    }

    async removePlayers(players: Player<this>[], reason: DisconnectReason): Promise<void> {
        for (const [ , client ] of this.connections) {
            await this.broadcastMessages([], players.map(player => 
                new S2CRemovePlayerMessage(this.code.id, player.clientId, reason, this.getClientAwareAuthorityId(client)),
            ), [ client ]);
            this.getClientAwareAuthorityId(client)
        }
    }

    async playerVoteKicked(player: Player<this>): Promise<void> {
        await this.removePlayers([ player ], DisconnectReason.Kicked);
    }

    async removeUnreadiedPlayers(players: Player<this>[]): Promise<void> {
        await this.removePlayers(players, DisconnectReason.LobbyInactivity);
    }
}
