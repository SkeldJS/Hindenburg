import chalk from "chalk";
import util from "util";

import {
    AirshipStatus,
    AprilShipStatus,
    AutoDoorsSystem,
    AutoOpenDoor,
    CustomNetworkTransform,
    DeconSystem,
    Door,
    DoorsSystem,
    ElectricalDoorsSystem,
    GameData,
    Hostable,
    HqHudSystem,
    HudOverrideSystem,
    InnerShipStatus,
    LifeSuppSystem,
    LobbyBehaviour,
    MedScanSystem,
    MeetingHud,
    PlayerVoteArea,
    MovingPlatformSystem,
    PlayerControl,
    PlayerData,
    PlayerPhysics,
    PolusShipStatus,
    ReactorSystem,
    SabotageSystem,
    SecurityCameraSystem,
    SkeldShipStatus,
    SwitchSystem,
    SystemStatus,
    SystemType,
    VoteBanSystem,
    AlterGameTag,
    MiraShipStatus,
    DisconnectReason,
    HeliSabotageSystem,
    Platform,
    PlayerDataResolvable,
    Networkable,
    SpawnType
} from "@skeldjs/core";

import {
    AlterGameMessage,
    BaseGameDataMessage,
    BaseRootMessage,
    CompleteTaskMessage,
    DataMessage,
    DespawnMessage,
    EnterVentMessage,
    ExitVentMessage,
    GameDataMessage,
    GameSettings,
    JoinGameMessage,
    BaseMessage,
    PlatformSpecificData,
    ReliablePacket,
    RemovePlayerMessage,
    RpcMessage,
    Serializable,
    SetColorMessage,
    SetHatMessage,
    SetInfectedMessage,
    SetNameMessage,
    SetNameplateMessage,
    SetPetMessage,
    SetSkinMessage,
    SetStartCounterMessage,
    SetVisorMessage,
    SyncSettingsMessage,
    MessageDirection
} from "@skeldjs/protocol";

import { HazelWriter, Vector2 } from "@skeldjs/util";

import { chunkArr } from "../util/chunkArr";
import { MasketDecoder } from "../util/MasketDecoder";
import { fmtCode } from "../util/fmtCode";

import { Logger } from "../logger";

import { PacketContext } from "./Worker";
import { BaseRoom, SpecialClientId } from "./BaseRoom";
import { Connection } from "./Connection";
import { getPerspectiveFilterMessageFilters, MessageFilterDirection, PerspectiveFilter } from "../api";

export type AllSystems = Map<SystemType, SystemStatus<any, any>>;

/**
 * Preset perspective filters to use with {@link Room.createPerspective}.
 */
export enum PresetFilter {
    /**
     * Block all gamedata updates:
     * * {@link SetNameMessage}
     * * {@link SetColorMessage}
     * * {@link SetHatMessage}
     * * {@link SetPetMessage}
     * * {@link SetSkinMessage}
     */
    GameDataUpdates,
    /**
     * Block all movement packets from players:
     * * {@link DataMessage} (only those coming from {@link CustomNetworkTransform} objects)
     */
    PositionUpdates,
    /**
     * Block all room settings updates:
     * * {@link SyncSettingsMessage}
     */
    SettingsUpdates,
    /**
     * Block all chat messages:
     * * {@link SendChatMessage}
     */
    ChatMessages,
    /**
     * Block all updates for any objects:
     * * {@link SpawnMessage}
     * * {@link DespawnMessage}
     */
    ObjectUpdates
}

/**
 * Represents the entire room from the perspective of a set of players.
 * Different from the {@link Room}, it allows you to create an entire space
 * completely separate, affecting only specified players. Think of it like a
 * sandbox which acts as a mirror, and as a space which allows plugins and
 * players to do anything without affecting the original room.
 *
 * As a mirror, it is initially a perfect clone of the original room. It has filters,
 * which allow you to control which incoming packets get sent to the perspective,
 * and which outgoing packets get sent to the room. See {@link Room.createPerspective}
 * and {@link PresetFilter} for preset filters to use.
 *
 * Overtime, the perspective will get more and more out of sync with the original
 * room. When destroyed, all players will be brought back up-to-date with the
 * current state of the room.
 *
 * This class shouldn't be instantiated directly, instead, see {@link Room.createPerspective}.
 *
 * @example
 * ```ts
 * // Make every other player appear black and without a name for somePlayer.
 *
 * const perspective = room.createPerspective(somePlayer, [
 *   PerspectiveFilter.gameDataUpdates
 * ]); // Create a perspective for somePlayer, filtering out gamedata updates (names, colours, hats, etc.)
 *
 * for (const [ , player ] of perspective.players) {
 *   player.control?.setColor(Color.Black);
 *   player.control?.setName("?????");
 *   player.control?.setHat(Hat.None);
 *   player.control?.setPet(Pet.None);
 *   player.control?.setSkin(Skin.None);
 * }
 *
 * await sleep(10000);
 *
 * perspective.destroyPerspective(); // destroy and restore state for players in this perspective
 * ```
 */
export class Perspective extends BaseRoom {
    messageNonce: Set<BaseMessage>;

    protected incomingFilter: MasketDecoder;
    protected outgoingFilter: MasketDecoder;

    /**
     * @internal
     */
    constructor(
        /**
         * The original room that this perspective is mirroring.
         */
        public readonly parentRoom: BaseRoom,
        /**
         * The players that this perspective is from the perspective of. Every
         * player object is from the original {@link Room} object, rather than
         * this perspective object.
         */
        public readonly playersPov: PlayerData[],
        public readonly createdBy: Connection|undefined
    ) {
        super(parentRoom.worker, parentRoom.config, parentRoom.settings, createdBy);

        this.playerJoinedFlag = true; // prevent room closing due to inactivity
        this.messageNonce = new Set;

        this.incomingFilter = new MasketDecoder(parentRoom.worker.decoder);
        this.outgoingFilter = new MasketDecoder(parentRoom.worker.decoder);

        this.logger = new Logger(() => {
            if (this.playersPov.length === 1) {
                return `${chalk.yellow(fmtCode(this.code))} @ ${util.format(this.playersPov[0])}`;
            } else {
                return `${chalk.yellow(fmtCode(this.code))} @ ${this.playersPov.length} players`;
            }
        }, this.worker.vorpal);

        for (const [ , player ] of parentRoom.players) {
            const newPlayer = new PlayerData(this, player.clientId, player.username, player.platform, player.playerLevel);
            this.players.set(player.clientId, newPlayer);
        }

        for (let i = 0; i < playersPov.length; i++) {
            const playerPov = playersPov[i];
            const playerConnection = parentRoom.connections.get(playerPov.clientId);

            if (!playerConnection)
                continue;

            this.connections.set(playerConnection.clientId, playerConnection);
        }

        for (const [ netId, component ] of parentRoom.netobjects) {
            if (component instanceof AirshipStatus) {
                const airshipStatus = component as AirshipStatus<this>;
                const newAs = new AirshipStatus(this, component.spawnType, netId, component.ownerId, component.flags);

                newAs.systems = this.cloneSystems(airshipStatus) as typeof airshipStatus.systems;

                this.shipStatus = newAs;
                this.netobjects.set(netId, newAs);
            } else if (component instanceof AprilShipStatus) {
                const aprilShipStatus = component as AprilShipStatus<this>;
                const newAss = new AprilShipStatus(this, component.spawnType, netId, component.ownerId, component.flags);

                newAss.systems = this.cloneSystems(aprilShipStatus) as typeof aprilShipStatus.systems;

                this.shipStatus = newAss;
                this.netobjects.set(netId, newAss);
            } else if (component instanceof CustomNetworkTransform) {
                const cnt = component as CustomNetworkTransform<this>;
                const newCnt = new CustomNetworkTransform(this, component.spawnType, netId, component.ownerId, component.flags);
                newCnt.oldSeqId = cnt.oldSeqId;
                newCnt.seqId = cnt.seqId;
                newCnt.position = new Vector2(cnt.position);
                newCnt.velocity = new Vector2(cnt.velocity);

                this.netobjects.set(netId, newCnt);
            } else if (component instanceof GameData) {
                const gameData = component as GameData<this>;
                const newGd = new GameData(this, component.spawnType, netId, component.ownerId, component.flags, {
                    players: new Map
                });
                for (const [ playerId, playerInfo ] of gameData.players) {
                    const newPlayerInfo = playerInfo.clone(playerInfo.playerId);
                    (newPlayerInfo as any).gamedata = newGd;
                    newGd.players.set(playerId, newPlayerInfo);
                }

                this.gameData = newGd;
                this.netobjects.set(netId, newGd);
            } else if (component instanceof LobbyBehaviour) {
                const newLb = new LobbyBehaviour(this, component.spawnType, netId, component.ownerId, component.flags);
                this.netobjects.set(netId, newLb);
                this.lobbyBehaviour = newLb;
            } else if (component instanceof MeetingHud) {
                const meetingHud = component as MeetingHud<this>;
                const newMh = new MeetingHud(this, component.spawnType, netId, component.ownerId, component.flags);

                newMh.dirtyBit = meetingHud.dirtyBit;
                newMh.tie = meetingHud.tie;
                newMh.exiled = meetingHud.exiled
                    ? this.players.get(meetingHud.exiled?.clientId)
                    : undefined;

                for (const [ playerId, voteArea ] of meetingHud.voteStates) {
                    const newVoteArea = new PlayerVoteArea(meetingHud, playerId, voteArea.votedForId, voteArea.didReport);
                    newMh.voteStates.set(playerId, newVoteArea);
                }

                this.meetingHud = newMh;
                this.netobjects.set(netId, newMh);
            } else if (component instanceof MiraShipStatus) {
                const hqShipStatus = component as MiraShipStatus<this>;
                const newHqss = new MiraShipStatus(this, component.spawnType, netId, component.ownerId, component.flags);

                newHqss.systems = this.cloneSystems(hqShipStatus) as typeof hqShipStatus.systems;

                this.shipStatus = newHqss;
                this.netobjects.set(netId, newHqss);
            } else if (component instanceof PlayerControl) {
                const playerControl = component as PlayerControl<this>;
                const newPc = new PlayerControl(this, component.spawnType, netId, component.ownerId, component.flags);
                newPc.isNew = playerControl.isNew;
                newPc.playerId = playerControl.playerId;

                if (newPc.ownerId > 0) {
                    const clientOwner = this.players.get(newPc.ownerId);
                    if (clientOwner) {
                        clientOwner.control = newPc;

                        if (this.connections.get(clientOwner.clientId)) {
                            this.parentRoom.disownObject(playerControl);
                            this.guardObjectAsOwner(newPc);
                        }
                    }
                }
                this.netobjects.set(netId, newPc);
            } else if (component instanceof PlayerPhysics) {
                const playerPhysics = component as PlayerPhysics<this>;
                const newPp = new PlayerPhysics(this, component.spawnType, netId, component.ownerId, component.flags);

                newPp.ventId = playerPhysics.ventId;
                this.netobjects.set(netId, newPp);
            } else if (component instanceof PolusShipStatus) {
                const polusShipStatus = component as PolusShipStatus<this>;
                const newPss = new PolusShipStatus(this, component.spawnType, netId, component.ownerId, component.flags);

                newPss.systems = this.cloneSystems(polusShipStatus) as typeof polusShipStatus.systems;

                this.shipStatus = newPss;
                this.netobjects.set(netId, newPss);
            } else if (component instanceof SkeldShipStatus) {
                const shipStatus = component as SkeldShipStatus<this>;
                const newSss = new SkeldShipStatus(this, component.spawnType, netId, component.ownerId, component.flags);

                newSss.systems = this.cloneSystems(shipStatus) as typeof shipStatus.systems;

                this.shipStatus = newSss;
                this.netobjects.set(netId, newSss);
            } else if (component instanceof VoteBanSystem) {
                const voteBanSystem = component as VoteBanSystem<this>;
                const newVbs = new VoteBanSystem(this, component.spawnType, netId, component.ownerId, component.flags);

                for (const [ votedId, voters ] of voteBanSystem.voted) {
                    const newVoters = [];
                    for (const voter of voters) {
                        if (voter) {
                            const newVoter = this.players.get(voter.clientId);
                            newVoters.push(newVoter);
                        } else {
                            newVoters.push(undefined);
                        }
                    }
                    newVbs.voted.set(votedId, newVoters as [PlayerData<this>|undefined, PlayerData<this>|undefined, PlayerData<this>|undefined]);
                }

                this.voteBanSystem = newVbs;
                this.netobjects.set(netId, newVbs);
            }
        }

        for (const obj of parentRoom.objectList) {
            const objOnHere = this.netobjects.get(obj.netId)!;
            this.objectList.push(objOnHere);

            for (const component of obj.components) {
                const componentOnHere = this.netobjects.get(component.netId)!;
                objOnHere.components.push(componentOnHere);
            }
        }

        this.registeredPrefabs = new Map(parentRoom.registeredPrefabs.entries());
        this.registeredRoles = new Map(parentRoom.registeredRoles.entries());

        this.code = parentRoom.code;
        this.hostId = parentRoom.hostId;
        this.settings = new GameSettings(parentRoom.settings);
        this.counter = parentRoom.counter;
        this.privacy = parentRoom.privacy;
    }

    private cloneSystems(ship: InnerShipStatus<this>) {
        const systemsEntries = Object.entries(ship.systems) as unknown as [SystemType, SystemStatus<any, any>][];
        const newSystems: AllSystems = new Map;
        for (const [ systemType, system ] of systemsEntries) {
            if (system instanceof AutoDoorsSystem) {
                const newAd = new AutoDoorsSystem(ship, system.systemType);

                newAd.dirtyBit = system.dirtyBit;

                for (let i = 0; i < system.doors.length; i++) {
                    const door = system.doors[i];
                    const newDoor = new AutoOpenDoor(newAd, door.doorId, door.isOpen);
                    newDoor.timer = door.timer;
                    newAd.doors.push(newDoor);
                }

                newSystems.set(systemType, newAd);
            } else if (system instanceof DeconSystem) {
                const newDecon = new DeconSystem(ship, system.systemType);

                newDecon.timer = system.timer;
                newDecon.state = system.state;

                newSystems.set(systemType, newDecon);
            } else if (system instanceof DoorsSystem) {
                const newDoors = new DoorsSystem(ship, system.systemType);

                newDoors.cooldowns = new Map(system.cooldowns.entries());

                for (let i = 0; i < system.doors.length; i++) {
                    const door = system.doors[i];
                    const newDoor = new Door(newDoors, door.doorId, door.isOpen);
                    newDoors.doors.push(newDoor);
                }

                newSystems.set(systemType, newDoors);
            } else if (system instanceof ElectricalDoorsSystem) {
                const newEd = new ElectricalDoorsSystem(ship, system.systemType);

                for (let i = 0; i < system.doors.length; i++) {
                    const door = system.doors[i];
                    const newDoor = new Door(newEd, door.doorId, door.isOpen);
                    newEd.doors.push(newDoor);
                }

                newSystems.set(systemType, newEd);
            } else if (system instanceof HqHudSystem) {
                const newHh = new HqHudSystem(ship, system.systemType);

                newHh.timer = system.timer;
                newHh.activeConsoles = system.activeConsoles.map(active => ({
                    playerId: active.playerId,
                    consoleId: active.consoleId
                }));
                newHh.completedConsoles = new Set(newHh.completedConsoles);

                newSystems.set(systemType, newHh);
            } else if (system instanceof HudOverrideSystem) {
                const newHo = new HudOverrideSystem(ship, system.systemType);

                newHo["_sabotaged"] = system["_sabotaged"];

                newSystems.set(systemType, newHo);
            } else if (system instanceof LifeSuppSystem) {
                const newLs = new LifeSuppSystem(ship, system.systemType);

                newLs.timer = system.timer;
                newLs.completed = new Set(system.completed);

                newSystems.set(systemType, newLs);
            } else if (system instanceof HeliSabotageSystem) {
                const newHs = new HeliSabotageSystem(ship, system.systemType);

                newHs.countdown = system.countdown;
                newHs.resetTimer = system.resetTimer;
                newHs.activeConsoles = new Map(system.activeConsoles.entries());
                newHs.completedConsoles = new Set(system.completedConsoles);

                newSystems.set(systemType, newHs);
            } else if (system instanceof MedScanSystem) {
                const newMs = new MedScanSystem(ship, system.systemType);

                for (let i = 0; i < system.queue.length; i++) {
                    const queuePlayer = system.queue[i];
                    const newPlayer = this.players.get(queuePlayer.clientId);
                    newMs.queue.push(newPlayer!);
                }

                newSystems.set(systemType, newMs);
            } else if (system instanceof MovingPlatformSystem) {
                const newMp = new MovingPlatformSystem(ship, system.systemType);

                newMp.useId = system.useId;
                newMp.side = system.side;

                if (system.target) {
                    const newTarget = this.players.get(system.target.clientId);
                    newMp.target = newTarget;
                }

                newSystems.set(systemType, newMp);
            } else if (system instanceof ReactorSystem) {
                const newReactor = new ReactorSystem(ship, system.systemType);

                newReactor.timer = system.timer;
                newReactor.completed = new Set(system.completed);

                newSystems.set(systemType, newReactor);
            } else if (system instanceof SabotageSystem) {
                const newSab = new SabotageSystem(ship, system.systemType);

                newSab.cooldown = system.cooldown;

                newSystems.set(systemType, newSab);
            } else if (system instanceof SecurityCameraSystem) {
                const newSc = new SecurityCameraSystem(ship, system.systemType);

                for (const player of system.players) {
                    const newPlayer = this.players.get(player.clientId);
                    newSc.players.add(newPlayer!);
                }

                newSystems.set(systemType, newSc);
            } else if (system instanceof SwitchSystem) {
                const newSwitches = new SwitchSystem(ship, system.systemType);

                newSwitches.expected = [...system.expected];
                newSwitches.actual = [...system.actual];
                newSwitches.brightness = system.brightness;

                newSystems.set(systemType, newSwitches);
            }
        }

        return newSystems;
    }

    [Symbol.for("nodejs.util.inspect.custom")]() {
        return chalk.yellow(fmtCode(this.code)) + " @ " + (this.playersPov.length === 1
            ? util.format(this.playersPov[0])
            : (this.playersPov.length + " players"));
    }

    getNextNetId() {
        return this.parentRoom.getNextNetId();
    }

    async broadcast(
        gameData: BaseGameDataMessage[],
        payloads: BaseRootMessage[] = [],
        include?: PlayerDataResolvable[],
        exclude?: PlayerDataResolvable[],
        reliable = true
    ) {
        const includedConnections = include ? this.getRealConnections(include) : undefined;
        const excludedConnections = exclude ? this.getRealConnections(exclude) : undefined;

        const notCanceledOutgoingGameData = await this.getNotCanceledOutgoing(gameData, MessageDirection.Clientbound, undefined);
        const notCanceledOutgoingPayloads = await this.getNotCanceledOutgoing(payloads, MessageDirection.Clientbound, undefined);

        this.broadcastMessages(gameData, payloads, includedConnections, excludedConnections, reliable);

        if (notCanceledOutgoingGameData.length > 0 && notCanceledOutgoingPayloads.length > 0) {
            const notCanceledRoomGameData: BaseGameDataMessage[] = [];
            const notCanceledRoomPayloads: BaseRootMessage[] = [];
            const ctx: PacketContext = { sender: undefined, reliable, recipients: includedConnections };

            await this.parentRoom.processMessagesAndGetNotCanceled(notCanceledOutgoingGameData, notCanceledRoomGameData, ctx);
            await this.parentRoom.processMessagesAndGetNotCanceled(notCanceledOutgoingPayloads, notCanceledRoomPayloads, ctx);

            if (notCanceledRoomGameData.length > 0 || notCanceledRoomPayloads.length > 0)
                this.parentRoom.broadcastMessages(notCanceledRoomGameData, notCanceledRoomPayloads, includedConnections, excludedConnections, reliable);

            for (let i = 0; i < this.parentRoom.activePerspectives.length; i++) {
                const otherPerspective = this.parentRoom.activePerspectives[i];
                if (otherPerspective === this)
                    continue;

                const notCanceledOtherIncomingGameData = await otherPerspective.getNotCanceledIncoming(notCanceledOutgoingGameData, MessageDirection.Clientbound, undefined);
                const notCanceledOtherIncomingPayloads = await otherPerspective.getNotCanceledIncoming(notCanceledOutgoingPayloads, MessageDirection.Clientbound, undefined);

                const notCanceledPerspectiveGameData: BaseGameDataMessage[] = [];
                const notCanceledPerspectivePayloads: BaseRootMessage[] = [];
                await otherPerspective.processMessagesAndGetNotCanceled(notCanceledOtherIncomingGameData, notCanceledPerspectiveGameData, ctx);
                await otherPerspective.processMessagesAndGetNotCanceled(notCanceledOtherIncomingPayloads, notCanceledPerspectivePayloads, ctx);

                if (notCanceledPerspectiveGameData.length > 0 || notCanceledPerspectivePayloads.length > 0) {
                    otherPerspective.broadcastMessages(notCanceledPerspectiveGameData, notCanceledPerspectivePayloads, includedConnections, excludedConnections, reliable);
                }
            }
        }
    }

    async getNotCanceledIncoming(messages: BaseMessage[], direction: MessageDirection, sender?: Connection) {
        const notCanceled = [];
        for (let i = 0; i < messages.length; i++) {
            const message = messages[i];

            if (this.messageNonce.has(message)) {
                this.messageNonce.delete(message);
                continue;
            }

            if (await this.isCanceledIncoming(message, direction, sender))
                continue;

            notCanceled.push(message);
        }
        return notCanceled;
    }

    async getNotCanceledOutgoing(messages: BaseMessage[], direction: MessageDirection, sender?: Connection) {
        const notCanceled = [];
        for (let i = 0; i < messages.length; i++) {
            const message = messages[i];

            if (this.messageNonce.has(message))
                continue;

            if (await this.isCanceledOutgoing(message, direction, sender))
                continue;

            notCanceled.push(message);
        }
        return notCanceled;
    }

    async isCanceledIncoming(message: BaseMessage, direction: MessageDirection, sender?: Connection): Promise<boolean> {
        if (message instanceof RpcMessage) {
            const canceledBefore = message.data["_canceled"];
            message.data["_canceled"] = false;

            await this.incomingFilter.emit(message, direction, sender);

            if (message.data["_canceled"]) {
                message.data["_canceled"] = canceledBefore;
                return true;
            }

            return false;
        }

        const canceledBefore = message["_canceled"];
        message["_canceled"] = false;

        await this.incomingFilter.emit(message, direction, sender);

        if (message["_canceled"]) {
            message["_canceled"] = canceledBefore;
            return true;
        }

        return false;
    }

    async isCanceledOutgoing(message: BaseMessage, direction: MessageDirection, sender?: Connection): Promise<boolean> {
        if (message instanceof RpcMessage) {
            const canceledBefore = message.data["_canceled"];
            message.data["_canceled"] = false;

            await this.outgoingFilter.emit(message, direction, sender);

            if (message.data["_canceled"]) {
                message.data["_canceled"] = canceledBefore;
                return true;
            }

            return false;
        }

        const canceledBefore = message["_canceled"];
        message["_canceled"] = false;

        await this.outgoingFilter.emit(message, direction, sender);

        if (message["_canceled"]) {
            message["_canceled"] = canceledBefore;
            return true;
        }
        message["_canceled"] = canceledBefore;

        return false;
    }

    /**
     * Destroy this perspective, optionally restoring state for any players that
     * have been affected by it.
     *
     * @param restoreState Whether to restore state for players in this perspective.
     */
    async destroyPerspective(restoreState = true) {
        Hostable.prototype.destroy.call(this);

        if (restoreState) {
            const gameData = this.parentRoom.gameData!;
            const gameDataWriter = HazelWriter.alloc(0);
            gameData.dirtyBit = 0xffffffff;
            gameDataWriter.write(gameData, false);

            const voteBanSystem = this.parentRoom.voteBanSystem!;
            const voteBanSystemWriter = HazelWriter.alloc(0);
            voteBanSystemWriter.write(voteBanSystem, false);

            const messages: BaseGameDataMessage[] = [
                new DataMessage(
                    gameData.netId,
                    gameDataWriter.buffer
                ),
                new DataMessage(
                    voteBanSystem.netId,
                    voteBanSystemWriter.buffer
                )
            ];

            const payloads: BaseRootMessage[] = [
                new AlterGameMessage(
                    this.parentRoom.code,
                    AlterGameTag.ChangePrivacy,
                    this.parentRoom.privacy === "public" ? 1 : 0
                )
            ];

            // todo: figure out some way of handling spawns/despawns in perspectives
            // problems:
            // 1. despawning an object makes that netid not able to be used.
            //    - solution: have a per-connection netid counter and map
            //    - the host's netids to the connection's netids on every
            //    - message involving netids
            //        - probably slow AF
            // 2. you can't spawn a single component, you can only spawn
            // prefabs
            //    - solution: despawn every other component in that prefab,
            //    - and respawn the prefab
            for (const [ netId, netObject ] of this.netobjects) {
                if (!this.parentRoom.netobjects.get(netId)) {
                    messages.push(
                        new DespawnMessage(netId)
                    );
                    continue;
                }

                if (this.getOwnerOf(netObject) === this) {
                    this.disownObject(netObject);
                    this.parentRoom.guardObjectAsOwner(netObject);
                }
            }

            if (this.hostId !== this.parentRoom.hostId) {
                payloads.push(
                    new JoinGameMessage(
                        this.code,
                        SpecialClientId.Temp,
                        this.parentRoom.hostId,
                        "TEMP",
                        new PlatformSpecificData(Platform.StandaloneSteamPC, "TESTNAME"),
                        0,
                        "",
                        ""
                    )
                );
                payloads.push(
                    new RemovePlayerMessage(
                        this.code,
                        SpecialClientId.Temp,
                        DisconnectReason.Error,
                        this.parentRoom.hostId
                    )
                );
            }

            for (const [ clientId ] of this.players) {
                if (!this.parentRoom.players.get(clientId)) {
                    payloads.push(
                        new RemovePlayerMessage(
                            this.parentRoom.code,
                            clientId,
                            DisconnectReason.Error,
                            this.parentRoom.hostId
                        )
                    );
                }
            }

            for (const [ , player ] of this.parentRoom.players) {
                if (!this.players.has(player.clientId)) {
                    payloads.push(
                        new JoinGameMessage(
                            this.parentRoom.code,
                            player.clientId,
                            this.parentRoom.hostId,
                            player.username,
                            player.platform,
                            player.playerLevel,
                            "",
                            ""
                        )
                    );
                }
            }

            const shipStatus = this.parentRoom.shipStatus;
            if (shipStatus) {
                const systemTypes = Object.keys(shipStatus.systems);
                for (let i = 0; i < systemTypes.length; i++) {
                    const systemType = systemTypes[i];

                    (shipStatus.systems as any)[systemType].dirty = true; // cast to any because types are complicated LOL
                }

                const shipStatusWriter = HazelWriter.alloc(0);
                shipStatusWriter.write(shipStatus, false);

                messages.push(
                    new DataMessage(
                        shipStatus.netId,
                        shipStatusWriter.buffer
                    )
                );
            }

            const impostorIds = [];
            for (const [ , player ] of this.parentRoom.players) {
                const defaultOutfit = player.playerInfo?.defaultOutfit;
                if (!defaultOutfit)
                    continue;

                const playerControl = player.control!;
                messages.push(
                    new RpcMessage(
                        playerControl.netId,
                        new SetNameMessage(defaultOutfit.name)
                    )
                );

                messages.push(
                    new RpcMessage(
                        playerControl.netId,
                        new SetColorMessage(defaultOutfit.color)
                    )
                );

                messages.push(
                    new RpcMessage(
                        playerControl.netId,
                        new SetHatMessage(defaultOutfit.hatId)
                    )
                );

                messages.push(
                    new RpcMessage(
                        playerControl.netId,
                        new SetPetMessage(defaultOutfit.petId)
                    )
                );

                messages.push(
                    new RpcMessage(
                        playerControl.netId,
                        new SetSkinMessage(defaultOutfit.skinId)
                    )
                );

                messages.push(
                    new RpcMessage(
                        playerControl.netId,
                        new SetVisorMessage(defaultOutfit.visorId)
                    )
                );

                messages.push(
                    new RpcMessage(
                        playerControl.netId,
                        new SetNameplateMessage(defaultOutfit.nameplateId)
                    )
                );

                const playerPhysics = player.physics!;

                const playersPov = this.resolvePlayer(player);
                if (playerPhysics.isInVent) {
                    messages.push(
                        new RpcMessage(
                            playerPhysics.netId,
                            new EnterVentMessage(playerPhysics.ventId)
                        )
                    );
                } else if (playersPov && playersPov.physics && playersPov.physics.ventId >= 0) {
                    messages.push(
                        new RpcMessage(
                            playerPhysics.netId,
                            new ExitVentMessage(playersPov.physics.ventId)
                        )
                    );
                }

                const ctrl = player.control!;
                const ctrlWriter = HazelWriter.alloc(1);
                ctrlWriter.write(ctrl, false);

                messages.push(
                    new DataMessage(
                        ctrl.netId,
                        ctrlWriter.buffer
                    )
                );

                const phys = player.physics!;
                const physWriter = HazelWriter.alloc(1);
                physWriter.write(phys, false);

                messages.push(
                    new DataMessage(
                        phys.netId,
                        physWriter.buffer
                    )
                );

                const cnt = player.transform!;
                const cntWriter = HazelWriter.alloc(10);
                cntWriter.write(cnt, false);

                messages.push(
                    new DataMessage(
                        cnt.netId,
                        cntWriter.buffer
                    )
                );

                if (player.playerInfo?.isImpostor) {
                    impostorIds.push(player.playerId!);

                    for (let i = 0; i < player.playerInfo.taskStates.length; i++) {
                        const taskState = player.playerInfo.taskStates[i];

                        if (taskState.completed) {
                            messages.push(
                                new RpcMessage(
                                    playerControl.netId,
                                    new CompleteTaskMessage(i)
                                )
                            );
                        }
                    }
                }
            }

            const hostPlayer = this.parentRoom.host;
            if (hostPlayer) {
                messages.push(
                    new RpcMessage(
                        hostPlayer.control!.netId,
                        new SetInfectedMessage(impostorIds)
                    )
                );

                messages.push(
                    new RpcMessage(
                        hostPlayer.control!.netId,
                        new SyncSettingsMessage(this.parentRoom.settings)
                    )
                );

                (hostPlayer.control as any).lastStartCounter++;
                messages.push(
                    new RpcMessage(
                        hostPlayer.control!.netId,
                        new SetStartCounterMessage(
                            (hostPlayer.control as any).lastStartCounter,
                            this.parentRoom.counter
                        )
                    )
                );
            }

            const chunkedMessages = chunkArr(messages, 5);
            const chunkedPayloads = chunkArr(payloads, 3);

            for (let i = 0; i < this.playersPov.length; i++) {
                const playersPov = this.playersPov[i];
                this.parentRoom.playerPerspectives.delete(playersPov.clientId);

                /**
                 * todo:
                 * - [ ] Restore room state
                 *   - [x] Restore room visibility
                 *   - [x] Restore room host
                 *   - [x] Restore impostors
                 *   - [x] Restore room settings
                 *   - [x] Restore room counter
                 *   - [ ] Restore started/ended/meeting
                 * - [ ] Restore objects
                 *   - [ ] Despawn spawned components
                 *   - [ ] Spawn despawned components and objects
                 *   - [x] Restore GameData
                 *   - [ ] Restore MeetingHud
                 *     - [ ] Restore player votes
                 *   - [x] Restore VoteBanSystem
                 *   - [x] Restore ShipStatus
                 *   - [x] Restore players
                 *     - [x] Restore PlayerControl
                 *     - [x] Restore PlayerPhysics
                 *     - [x] Restore CustomNetworkTransform
                 *     - [x] Restore player info
                 */

                const playerConn = this.parentRoom.connections.get(playersPov.clientId);

                if (!playerConn)
                    continue;

                for (let i = 0; i < Math.max(chunkedMessages.length, chunkedPayloads.length); i++) {
                    playerConn.sendPacket(
                        new ReliablePacket(
                            playerConn.getNextNonce(),
                            [
                                ...(chunkedMessages[i]
                                    ? [
                                        new GameDataMessage(
                                            this.parentRoom.code,
                                            chunkedMessages[i]
                                        )
                                    ]
                                    : []
                                ),
                                ...(chunkedPayloads[i] || [])
                            ]
                        )
                    );
                }
            }
        }

        for (let i = 0; i < this.playersPov.length; i++) {
            const playersPov = this.playersPov[i];
            this.parentRoom.playerPerspectives.delete(playersPov.clientId);
        }

        this.parentRoom.activePerspectives.splice(this.parentRoom.activePerspectives.indexOf(this), 1);
    }

    getDecoder(direction: MessageFilterDirection) {
        switch (direction) {
        case MessageFilterDirection.Incoming: return this.incomingFilter;
        case MessageFilterDirection.Outgoing: return this.outgoingFilter;
        }
    }

    registerFilter(filter: PerspectiveFilter): void;
    registerFilter(filter: PerspectiveFilter, direction?: MessageFilterDirection): void;
    registerFilter(filter: PerspectiveFilter, direction?: MessageFilterDirection) {
        const filterClass = Object.getPrototypeOf(filter);

        if (filterClass === null)
            throw new Error("Invalid event observer");

        if (direction === undefined) {
            this.registerFilter(filter, MessageFilterDirection.Incoming);
            this.registerFilter(filter, MessageFilterDirection.Outgoing);
            return;
        }

        const filterDecoder = this.getDecoder(direction);

        const messageFilters = getPerspectiveFilterMessageFilters(filterClass);
        for (const messageFilter of messageFilters) {
            const fn = (message: Serializable, _direction: MessageDirection, ctx: PacketContext) =>
                messageFilter.handler.call(filter, message, this, direction, ctx);

            filterDecoder.on(messageFilter.messageClass, fn);

            filter.getFilters().push({ messageClass: messageFilter.messageClass, handler: fn });
        }
    }

    removeFilter(filter: PerspectiveFilter): void;
    removeFilter(filter: PerspectiveFilter, direction: MessageFilterDirection): void;
    removeFilter(filter: PerspectiveFilter, direction?: MessageFilterDirection) {
        if (direction === undefined) {
            this.removeFilter(filter, MessageFilterDirection.Incoming);
            this.removeFilter(filter, MessageFilterDirection.Outgoing);
            return;
        }

        const filterDecoder = this.getDecoder(direction);

        for (const messageFilter of filter.getFilters()) {
            filterDecoder.off(messageFilter.messageClass, messageFilter.handler);
        }
    }

    createPerspective(): Perspective {
        throw new TypeError("Cannot create a perspective from another perspective; create one from the original room instead.");
    }

    /**
     * Resolve a player by some identifier, taking into account the player in the perspective.
     * @param player The identifier to resolve to a player.
     * @returns The resolved player
     * @example
     * ```ts
     * const playerPov = perspective.resolvePlayer(originalPlayer);
     * ```
     */
    resolvePlayer(player: PlayerDataResolvable): PlayerData<this>|undefined {
        if (player instanceof PlayerData && player.room === this)
            return player as PlayerData<this>;

        const clientId = this.resolvePlayerClientID(player);

        if (clientId === undefined)
            return undefined;

        return this.players.get(clientId);
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
    guardObjectAsOwner(netObject: Networkable) {
        if (this.parentRoom.ownershipGuards.has(netObject.netId))
            throw new Error("An object with the same network id is already owned; the room must disown it first");

        this.parentRoom.ownershipGuards.set(netObject.netId, this);
    }

    /**
     * Unknown an object so that all rooms can make changes to it.
     * @param netObject The object to disown
     */
    disownObject(netObject: Networkable) {
        const ownership = this.parentRoom.ownershipGuards.get(netObject.netId);
        if (!ownership || ownership !== this) {
            console.log(SpawnType[netObject.spawnType], netObject.netId);
            throw new Error("Cannot disown object; an object with that network id isn't owned by this room");
        }

        this.parentRoom.ownershipGuards.delete(netObject.netId);
    }

    /**
     * Get the owner of an object.
     * @param netObject The object to disown
     */
    getOwnerOf(netObject: Networkable) {
        return this.parentRoom.ownershipGuards.get(netObject.netId);
    }

    canManageObject(object: Networkable): boolean {
        const ownership = this.parentRoom.ownershipGuards.get(object.netId);
        return !ownership || ownership === this;
    }
}
