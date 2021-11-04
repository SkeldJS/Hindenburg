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
    PlayerInfo,
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
    HeliSabotageSystem
} from "@skeldjs/core";

import {
    AlterGameMessage,
    BaseGameDataMessage,
    BaseRootMessage,
    CompleteTaskMessage,
    DataMessage,
    DespawnMessage,
    EnterVentMessage,
    GameDataMessage,
    GameSettings,
    JoinGameMessage,
    MessageDirection,
    ReliablePacket,
    RemovePlayerMessage,
    RpcMessage,
    SendChatMessage,
    SetColorMessage,
    SetHatMessage,
    SetInfectedMessage,
    SetNameMessage,
    SetPetMessage,
    SetSkinMessage,
    SetStartCounterMessage,
    SnapToMessage,
    SpawnMessage,
    SyncSettingsMessage
} from "@skeldjs/protocol";

import { HazelWriter, Vector2 } from "@skeldjs/util";

import { Worker } from "./Worker";
import { BaseRoom, SpecialClientId } from "./BaseRoom";

import { chunkArr } from "./util/chunkArr";
import { MasketDecoder } from "./util/MasketDecoder";
import { fmtCode } from "./util/fmtCode";

import { Logger } from "./logger";

export type AllSystems<RoomType extends Hostable<any>> = Partial<Record<SystemType, SystemStatus<any, any, RoomType>>>;

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
 * Syntactic sugar for a {@link MasketDecoder}, used in perspectives as a way
 * to filter incoming and outgoing packets, see {@link Perspective.incomingFilter}.
 */
export class PerspectiveFilter extends MasketDecoder {
    constructor(worker: Worker) {
        super(worker.decoder);
    }
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
    /**
     * @internal
     */
    constructor(
        /**
         * The original room that this perspective is mirroring.
         */
        private readonly parentRoom: BaseRoom,
        /**
         * The players that this perspective is from the perspective of. Every
         * player object is from the original {@link Room} object, rather than
         * this perspective object.
         */
        public readonly playersPov: PlayerData[],
        /**
         * Filter for packets making their way into the perspective. See {@link Perspective.outgoingFilter}
         * for handling outgoing packets.
         *
         * @example
         * ```ts
         * perspective.incomingFilter.on([ SetColorMessage, SetNameMessage, SetSkinMessage, SetPetMessage, SetHatMessage ], message => {
         *   message.cancel();
         * });
         * ```
         */
        public incomingFilter: PerspectiveFilter,
        /**
         * Filter for packets making their way out of the perspective into the room.
         * See {@link Perspective.incomingFilter} to handle incoming packets.
         *
         * By default, this is different from the incoming filter. You can manually
         * re-assign it to {@link incomingFilter} to have the same filters for
         * both incoming and outgoing packets.
         *
         * @example
         * ```ts
         * perspective.outgoingFilter = perspective.incomingFilter;
         *
         * perspective.outgoingFilter.on([ SetColorMessage, SetNameMessage, SetSkinMessage, SetPetMessage, SetHatMessage ], message => {
         *   message.cancel();
         * });
         * ```
         */
        public outgoingFilter: PerspectiveFilter
    ) {
        super(parentRoom.worker, parentRoom.config, parentRoom.settings);

        this.logger = new Logger(() => {
            if (this.playersPov.length === 1) {
                return `${chalk.yellow(fmtCode(this.code))} @ ${util.format(this.playersPov[0])}`;
            } else {
                return `${chalk.yellow(fmtCode(this.code))} @ ${this.playersPov.length} players`;
            }
        }, this.worker.vorpal);

        for (const [ clientId ] of parentRoom.players) {
            const newPlayer = new PlayerData(this, clientId);
            this.players.set(clientId, newPlayer);
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
                const newAs = new AirshipStatus(this, component.spawnType, netId, component.flags, component.ownerId);

                newAs.systems = this.cloneSystems(airshipStatus) as typeof airshipStatus.systems;

                this.shipStatus = newAs;
                this.netobjects.set(netId, newAs);
            } else if (component instanceof AprilShipStatus) {
                const aprilShipStatus = component as AprilShipStatus<this>;
                const newAss = new AprilShipStatus(this, component.spawnType, netId, component.flags, component.ownerId);

                newAss.systems = this.cloneSystems(aprilShipStatus) as typeof aprilShipStatus.systems;

                this.shipStatus = newAss;
                this.netobjects.set(netId, newAss);
            } else if (component instanceof CustomNetworkTransform) {
                const cnt = component as CustomNetworkTransform<this>;
                const newCnt = new CustomNetworkTransform(this, component.spawnType, netId, component.flags, component.ownerId);
                newCnt.oldSeqId = cnt.oldSeqId;
                newCnt.seqId = cnt.seqId;
                newCnt.position = new Vector2(cnt.position);
                newCnt.velocity = new Vector2(cnt.velocity);

                this.netobjects.set(netId, newCnt);
            } else if (component instanceof GameData) {
                const gameData = component as GameData<this>;
                const newGd = new GameData(this, component.spawnType, netId, component.flags, component.ownerId, {
                    players: new Map
                });
                for (const [ playerId, playerInfo ] of gameData.players) {
                    const newPlayerInfo = new PlayerInfo(
                        newGd,
                        playerInfo.playerId,
                        playerInfo.name,
                        playerInfo.color,
                        playerInfo.hat,
                        playerInfo.pet,
                        playerInfo.skin,
                        playerInfo.flags,
                        playerInfo.taskIds,
                        playerInfo.taskStates
                    );
                    newGd.players.set(playerId, newPlayerInfo);
                }

                this.gameData = newGd;
                this.netobjects.set(netId, newGd);
            } else if (component instanceof LobbyBehaviour) {
                const newLb = new LobbyBehaviour(this, component.spawnType, netId, component.flags, component.ownerId);
                this.netobjects.set(netId, newLb);
                this.lobbyBehaviour = newLb;
            } else if (component instanceof MeetingHud) {
                const meetingHud = component as MeetingHud<this>;
                const newMh = new MeetingHud(this, component.spawnType, netId, component.flags, component.ownerId);

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
                const newHqss = new MiraShipStatus(this, component.spawnType, netId, component.flags, component.ownerId);

                newHqss.systems = this.cloneSystems(hqShipStatus) as typeof hqShipStatus.systems;

                this.shipStatus = newHqss;
                this.netobjects.set(netId, newHqss);
            } else if (component instanceof PlayerControl) {
                const playerControl = component as PlayerControl<this>;
                const newPc = new PlayerControl(this, component.spawnType, netId, component.flags, component.ownerId);
                newPc.isNew = playerControl.isNew;
                newPc.playerId = playerControl.playerId;

                if (newPc.ownerId > 0) {
                    const clientOwner = this.players.get(newPc.ownerId);
                    if (clientOwner) {
                        clientOwner.character = newPc;
                    }
                }
                this.netobjects.set(netId, newPc);
            } else if (component instanceof PlayerPhysics) {
                const playerPhysics = component as PlayerPhysics<this>;
                const newPp = new PlayerPhysics(this, component.spawnType, netId, component.flags, component.ownerId);

                newPp.ventid = playerPhysics.ventid;
                this.netobjects.set(netId, newPp);
            } else if (component instanceof PolusShipStatus) {
                const polusShipStatus = component as PolusShipStatus<this>;
                const newPss = new PolusShipStatus(this, component.spawnType, netId, component.flags, component.ownerId);

                newPss.systems = this.cloneSystems(polusShipStatus) as typeof polusShipStatus.systems;

                this.shipStatus = newPss;
                this.netobjects.set(netId, newPss);
            } else if (component instanceof SkeldShipStatus) {
                const shipStatus = component as SkeldShipStatus<this>;
                const newSss = new SkeldShipStatus(this, component.spawnType, netId, component.flags, component.ownerId);

                newSss.systems = this.cloneSystems(shipStatus) as typeof shipStatus.systems;

                this.shipStatus = newSss;
                this.netobjects.set(netId, newSss);
            } else if (component instanceof VoteBanSystem) {
                const voteBanSystem = component as VoteBanSystem<this>;
                const newVbs = new VoteBanSystem(this, component.spawnType, netId, component.flags, component.ownerId);

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

        this.spawnPrefabs = new Map(parentRoom.spawnPrefabs.entries());

        this.code = parentRoom.code;
        this.hostId = parentRoom.hostId;
        this.settings = new GameSettings(parentRoom.settings);
        this.counter = parentRoom.counter;
        this.privacy = parentRoom.privacy;
    }

    private cloneSystems(ship: InnerShipStatus<this>) {
        const systemsEntries = Object.entries(ship.systems) as unknown as [SystemType, SystemStatus<any, any>][];
        const newSystems: AllSystems<this> = {};
        for (const [ systemType, system ] of systemsEntries) {
            if (system instanceof AutoDoorsSystem) {
                const newAd = new AutoDoorsSystem(ship, system.systemType);

                newAd.dirtyBit = system.dirtyBit;

                for (let i = 0; i < system.doors.length; i++) {
                    const door = system.doors[i];
                    const newDoor = new AutoOpenDoor(newAd, door.id, door.isOpen);
                    newDoor.timer = door.timer;
                    newAd.doors.push(newDoor);
                }

                newSystems[systemType] = newAd;
            } else if (system instanceof DeconSystem) {
                const newDecon = new DeconSystem(ship, system.systemType);

                newDecon.timer = system.timer;
                newDecon.state = system.state;

                newSystems[systemType] = newDecon;
            } else if (system instanceof DoorsSystem) {
                const newDoors = new DoorsSystem(ship, system.systemType);

                newDoors.cooldowns = new Map(system.cooldowns.entries());

                for (let i = 0; i < system.doors.length; i++) {
                    const door = system.doors[i];
                    const newDoor = new Door(newDoors, door.id, door.isOpen);
                    newDoors.doors.push(newDoor);
                }

                newSystems[systemType] = newDoors;
            } else if (system instanceof ElectricalDoorsSystem) {
                const newEd = new ElectricalDoorsSystem(ship, system.systemType);

                for (let i = 0; i < system.doors.length; i++) {
                    const door = system.doors[i];
                    const newDoor = new Door(newEd, door.id, door.isOpen);
                    newEd.doors.push(newDoor);
                }

                newSystems[systemType] = newEd;
            } else if (system instanceof HqHudSystem) {
                const newHh = new HqHudSystem(ship, system.systemType);

                newHh.timer = system.timer;
                newHh.activeConsoles = system.activeConsoles.map(active => ({
                    playerid: active.playerid,
                    consoleid: active.consoleid
                }));
                newHh.completedConsoles = new Set(newHh.completedConsoles);

                newSystems[systemType] = newHh;
            } else if (system instanceof HudOverrideSystem) {
                const newHo = new HudOverrideSystem(ship, system.systemType);

                newHo["_sabotaged"] = system["_sabotaged"];

                newSystems[systemType] = newHo;
            } else if (system instanceof LifeSuppSystem) {
                const newLs = new LifeSuppSystem(ship, system.systemType);

                newLs.timer = system.timer;
                newLs.completed = new Set(system.completed);

                newSystems[systemType] = newLs;
            } else if (system instanceof HeliSabotageSystem) {
                const newHs = new HeliSabotageSystem(ship, system.systemType);

                newHs.countdown = system.countdown;
                newHs.resetTimer = system.resetTimer;
                newHs.activeConsoles = new Map(system.activeConsoles.entries());
                newHs.completedConsoles = new Set(system.completedConsoles);

                newSystems[systemType] = newHs;
            } else if (system instanceof MedScanSystem) {
                const newMs = new MedScanSystem(ship, system.systemType);

                for (let i = 0; i < system.queue.length; i++) {
                    const queuePlayer = system.queue[i];
                    const newPlayer = this.players.get(queuePlayer.clientId);
                    newMs.queue.push(newPlayer!);
                }

                newSystems[systemType] = newMs;
            } else if (system instanceof MovingPlatformSystem) {
                const newMp = new MovingPlatformSystem(ship, system.systemType);

                newMp.useId = system.useId;
                newMp.side = system.side;

                if (system.target) {
                    const newTarget = this.players.get(system.target.clientId);
                    newMp.target = newTarget;
                }

                newSystems[systemType] = newMp;
            } else if (system instanceof ReactorSystem) {
                const newReactor = new ReactorSystem(ship, system.systemType);

                newReactor.timer = system.timer;
                newReactor.completed = new Set(system.completed);

                newSystems[systemType] = newReactor;
            } else if (system instanceof SabotageSystem) {
                const newSab = new SabotageSystem(ship, system.systemType);

                newSab.cooldown = system.cooldown;

                newSystems[systemType] = newSab;
            } else if (system instanceof SecurityCameraSystem) {
                const newSc = new SecurityCameraSystem(ship, system.systemType);

                for (const player of system.players) {
                    const newPlayer = this.players.get(player.clientId);
                    newSc.players.add(newPlayer!);
                }

                newSystems[systemType] = newSc;
            } else if (system instanceof SwitchSystem) {
                const newSwitches = new SwitchSystem(ship, system.systemType);

                newSwitches.expected = [...system.expected];
                newSwitches.actual = [...system.actual];
                newSwitches.brightness = system.brightness;

                newSystems[systemType] = newSwitches;
            }
        }

        return newSystems;
    }

    [Symbol.for("nodejs.util.inspect.custom")]() {
        return chalk.yellow(fmtCode(this.code)) + " @ " + (this.playersPov.length === 1
            ? util.format(this.playersPov[0])
            : (this.playersPov.length + " players"));
    }

    static applyPerspectiveFilter(perspective: Perspective, decoder: PerspectiveFilter, filters: PresetFilter[]) {
        for (let i = 0; i < filters.length; i++) {
            const filter = filters[i];
            if (filter === PresetFilter.GameDataUpdates) {
                decoder.on([ SetColorMessage, SetNameMessage, SetSkinMessage, SetPetMessage, SetHatMessage ], message => {
                    message.cancel();
                });
            } else if (filter === PresetFilter.PositionUpdates) {
                decoder.on([ SnapToMessage ], message => {
                    message.cancel();
                });

                decoder.on([ DataMessage ], message => {
                    const netobject = perspective.netobjects.get(message.netid);

                    if (netobject instanceof CustomNetworkTransform) {
                        message.cancel();
                    }
                });
            } else if (filter === PresetFilter.SettingsUpdates) {
                decoder.on([ SyncSettingsMessage ], message => {
                    message.cancel();
                });
            } else if (filter === PresetFilter.ChatMessages) {
                decoder.on([ SendChatMessage ], message => {
                    message.cancel();
                });
            } else if (filter === PresetFilter.ObjectUpdates) {
                decoder.on([ SpawnMessage ], message => {
                    message.cancel();
                });

                decoder.on([ DespawnMessage ], message => {
                    message.cancel();
                });
            }
        }
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

        const povNotCanceled = [];
        for (let i = 0; i < messages.length; i++) {
            const child = messages[i];

            (child as any)._canceled = false; // child._canceled is private
            await this.outgoingFilter.emitDecoded(child, MessageDirection.Serverbound, undefined);

            if (child.canceled)
                continue;

            if (!recipient) {
                await this.parentRoom.decoder.emitDecoded(child, MessageDirection.Serverbound, undefined);

                if (child.canceled)
                    continue;
            }

            povNotCanceled.push(child);
        }

        if (povNotCanceled.length) {
            let notCanceled = !recipient || recipient.room === this
                ? povNotCanceled
                : [];

            if (recipient && recipient.room !== this) {
                if (recipient.room instanceof Perspective) { // match messages against the recipient player's perspective's incoming filter
                    for (let i = 0; i < povNotCanceled.length; i++) {
                        const child = povNotCanceled[i];

                        (child as any)._canceled = false; // child._canceled is private
                        await recipient.room.incomingFilter.emitDecoded(child, MessageDirection.Serverbound, recipient);

                        if (child.canceled)
                            continue;

                        notCanceled.push(child);
                    }
                } else {
                    notCanceled = povNotCanceled;
                }
            }

            await this.parentRoom.broadcastMessages(notCanceled, payloads, recipientConnection ? [recipientConnection] : undefined);
        }

        return this.broadcastMessages(messages, payloads, recipientConnection ? [recipientConnection] : undefined);
    }

    /**
     * Destroy this perspective, optionally restoring state for any players that
     * have been affected by it.
     *
     * @param restoreState Whether to restore state for players in this perspective.
     */
    async destroyPerspective(restoreState = true) {
        Hostable.prototype.destroy.call(this);

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

            if (restoreState) {
                const playerConn = this.parentRoom.connections.get(playersPov.clientId);

                if (!playerConn)
                    continue;

                const gameData = this.parentRoom.gameData!;
                const gameDataWriter = HazelWriter.alloc(0);
                gameData.dirtyBit = 0b111111111111111;
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
                // 1. despawning an objet makes that netid not able to be used.
                //    - solution: have a per-connection netid counter and map
                //    - the host's netids to the connection's netids on every
                //    - message involving netids
                //        - probably slow AF
                // 2. you can't spawn a single component, you can only spawn
                // prefabs
                //    - solution: despawn every other component in that prefab,
                //    - and respawn the prefab
                for (const [ netId ] of this.netobjects) {
                    if (!this.parentRoom.netobjects.get(netId)) {
                        messages.push(
                            new DespawnMessage(netId)
                        );
                    }
                }

                if (this.hostId !== this.parentRoom.hostId) {
                    payloads.push(
                        new JoinGameMessage(
                            this.code,
                            SpecialClientId.Temp,
                            this.parentRoom.hostId
                        )
                    );
                    payloads.push(
                        new RemovePlayerMessage(
                            this.code,
                            SpecialClientId.Temp,
                            DisconnectReason.None,
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
                                DisconnectReason.None,
                                this.parentRoom.hostId
                            )
                        );
                    }
                }

                for (const [ clientId ] of this.parentRoom.players) {
                    if (!this.players.get(clientId)) {
                        payloads.push(
                            new JoinGameMessage(
                                this.parentRoom.code,
                                clientId,
                                this.parentRoom.hostId
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
                    if (!player.info)
                        continue;

                    const playerControl = player.control!;
                    messages.push(
                        new RpcMessage(
                            playerControl.netId,
                            new SetNameMessage(player.info.name)
                        )
                    );

                    messages.push(
                        new RpcMessage(
                            playerControl.netId,
                            new SetColorMessage(player.info.color)
                        )
                    );

                    messages.push(
                        new RpcMessage(
                            playerControl.netId,
                            new SetHatMessage(player.info.hat)
                        )
                    );

                    messages.push(
                        new RpcMessage(
                            playerControl.netId,
                            new SetPetMessage(player.info.pet)
                        )
                    );

                    messages.push(
                        new RpcMessage(
                            playerControl.netId,
                            new SetSkinMessage(player.info.skin)
                        )
                    );

                    const playerPhysics = player.physics!;

                    if (playerPhysics.ventid) {
                        messages.push(
                            new RpcMessage(
                                playerPhysics.netId,
                                new EnterVentMessage(playerPhysics.ventid)
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

                    if (player.info.isImpostor) {
                        impostorIds.push(player.playerId!);

                        for (let i = 0; i < player.info.taskStates.length; i++) {
                            const taskState = player.info.taskStates[i];

                            if (taskState.completed) {
                                messages.push(
                                    new RpcMessage(
                                        playerControl.netId,
                                        new CompleteTaskMessage(taskState.taskidx)
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

        this.parentRoom.activePerspectives.splice(this.parentRoom.activePerspectives.indexOf(this), 1);
    }

    createPerspective(): Perspective {
        throw new TypeError("Cannot create a perspective from another perspective; create one from the original room instead.");
    }
}
