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
    VoteBanSystem
} from "@skeldjs/core";

import { GameSettings } from "@skeldjs/protocol";
import { Vector2 } from "@skeldjs/util";
import { BaseRoom } from "./BaseRoom";
import { MasketDecoder } from "./util/MasketDecoder";

export type AllSystems<RoomType extends Hostable<any>> = Partial<Record<SystemType, SystemStatus<any, any, RoomType>>>;

export class Perspective extends BaseRoom {
    public readonly incomingFilter: MasketDecoder;
    public readonly outgoingFilter: MasketDecoder;

    constructor(
        private readonly parentRoom: BaseRoom,
        public readonly playersPov: PlayerData[]
    ) {
        super(parentRoom.worker, parentRoom.config, parentRoom.settings);

        this.incomingFilter = new MasketDecoder(parentRoom.worker.decoder);
        this.outgoingFilter = new MasketDecoder(parentRoom.worker.decoder);

        for (const [ clientId ] of parentRoom.players) {
            const newPlayer = new PlayerData(this, clientId);
            newPlayer.stream = [...newPlayer.stream];
            this.players.set(clientId, newPlayer);
        }

        for (let i = 0; i < playersPov.length; i++) {
            const playerPov = playersPov[i];
            const playerConnection = parentRoom.connections.get(playerPov.id);

            if (!playerConnection)
                continue;

            this.connections.set(playerConnection.clientId, playerConnection);
        }

        for (const [ netId, component ] of parentRoom.netobjects) {
            if (component.classname === "AirshipStatus") {
                const airshipStatus = component as AirshipStatus<this>;
                const newAs = new AirshipStatus(this, netId, component.ownerid);

                newAs.systems = this.cloneSystems(airshipStatus) as typeof airshipStatus.systems;

                this.netobjects.set(netId, newAs);
            } else if (component.classname === "AprilShipStatus") {
                const aprilShipStatus = component as AprilShipStatus<this>;
                const newAss = new AprilShipStatus(this, netId, component.ownerid);

                newAss.systems = this.cloneSystems(aprilShipStatus) as typeof aprilShipStatus.systems;

                this.netobjects.set(netId, newAss);
            } else if (component.classname === "CustomNetworkTransform") {
                const cnt = component as CustomNetworkTransform<this>;
                const newCnt = new CustomNetworkTransform(this, netId, component.ownerid);
                newCnt.oldSeqId = cnt.oldSeqId;
                newCnt.seqId = cnt.seqId;
                newCnt.position = new Vector2(cnt.position);
                newCnt.velocity = new Vector2(cnt.velocity);

                this.netobjects.set(netId, newCnt);
            } else if (component.classname === "GameData") {
                const gameData = component as GameData<this>;
                const newGd = new GameData(this, netId, component.ownerid, {
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

                this.netobjects.set(netId, newGd);
            } else if (component.classname === "LobbyBehaviour") {
                const newLb = new LobbyBehaviour(this, netId, component.ownerid);
                this.netobjects.set(netId, newLb);
            } else if (component.classname === "MeetingHud") {
                const meetingHud = component as MeetingHud<this>;
                const newMh = new MeetingHud(this, netId, component.ownerid);
                newMh.dirtyBit = meetingHud.dirtyBit;
                newMh.tie = meetingHud.tie;
                newMh.exiled = meetingHud.exiled
                    ? this.players.get(meetingHud.exiled?.id)
                    : undefined;

                for (const [ playerId, voteArea ] of meetingHud.states) {
                    const newVoteArea = new PlayerVoteArea(this, playerId, voteArea.votedForId, voteArea.didReport);
                    newMh.states.set(playerId, newVoteArea);
                }

                this.netobjects.set(netId, newMh);
            } else if (component.classname === "MiraShipStatus") {

            } else if (component.classname === "PlayerControl") {
                const playerControl = component as PlayerControl<this>;
                const newPc = new PlayerControl(this, netId, component.ownerid);
                newPc.isNew = playerControl.isNew;
                newPc.playerId = playerControl.playerId;

                this.netobjects.set(netId, newPc);
            } else if (component.classname === "PlayerPhysics") {
                const playerPhysics = component as PlayerPhysics<this>;
                const newPp = new PlayerPhysics(this, netId, component.ownerid);

                newPp.ventid = playerPhysics.ventid;
                this.netobjects.set(netId, newPp);
            } else if (component.classname === "PolusShipStatus") {
                const aprilShipStatus = component as PolusShipStatus<this>;
                const newPss = new PolusShipStatus(this, netId, component.ownerid);

                newPss.systems = this.cloneSystems(aprilShipStatus) as typeof aprilShipStatus.systems;

                this.netobjects.set(netId, newPss);
            } else if (component.classname === "SkeldShipStatus") {
                const aprilShipStatus = component as SkeldShipStatus<this>;
                const newSss = new SkeldShipStatus(this, netId, component.ownerid);

                newSss.systems = this.cloneSystems(aprilShipStatus) as typeof aprilShipStatus.systems;

                this.netobjects.set(netId, newSss);
            } else if (component.classname === "VoteBanSystem") {
                const voteBanSystem = component as VoteBanSystem<this>;
                const newVbs = new VoteBanSystem(this, netId, component.ownerid);
                
                for (const [ votedId, voters ] of voteBanSystem.voted) {
                    const newVoters = [];
                    for (const voter of voters) {
                        if (voter) {
                            const newVoter = this.players.get(voter.id);
                            newVoters.push(newVoter);
                        } else {
                            newVoters.push(undefined);
                        }
                    }
                    newVbs.voted.set(votedId, newVoters as [PlayerData<this>|undefined, PlayerData<this>|undefined, PlayerData<this>|undefined]);
                }
                this.netobjects.set(netId, newVbs);
            }
        }

        for (const [ ownerId, obj ] of parentRoom.objects) {
            if (ownerId === -2) {
                continue;
            }

            if (obj instanceof PlayerData) {
                const playerObject = this.players.get(ownerId)!;
                this.objects.set(ownerId, playerObject);

                for (let i = 0; i < obj.components.length; i++) {
                    const component = obj.components[i];
                    if (component) {
                        playerObject.components[i] = this.netobjects.get(component.netid)!;
                    } else {
                        playerObject.components[i] = null;
                    }
                }
            }
        }

        for (let i = 0; i < parentRoom.components.length; i++) {
            const component = parentRoom.components[i];
            if (component) {
                this.components[i] = this.netobjects.get(component.netid)!;
            } else {
                this.components[i] = null;
            }
        }

        this.registeredPrefabs = new Map(parentRoom.registeredPrefabs.entries());

        this.code = parentRoom.code;
        this.hostid = parentRoom.hostid;
        this.settings = new GameSettings(parentRoom.settings);
        this.counter = parentRoom.counter;
        this.privacy = parentRoom.privacy;
    }

    private cloneSystems(ship: InnerShipStatus<this>) {
        const systemsEntries = Object.entries(ship.systems) as unknown as [SystemType, SystemStatus<any, any>][];
        const newSystems: AllSystems<this> = {};
        for (const [ systemType, system ] of systemsEntries) {
            if (system instanceof AutoDoorsSystem) {
                const autoDoors = system as AutoDoorsSystem<this>;
                const newAd = new AutoDoorsSystem(ship)

                newAd.dirtyBit = autoDoors.dirtyBit;
                
                for (let i = 0; i < autoDoors.doors.length; i++) {
                    const door = autoDoors.doors[i];
                    const newDoor = new AutoOpenDoor(newAd, door.id, door.isOpen);
                    newDoor.timer = door.timer;
                    newAd.doors.push(newDoor);
                }

                newSystems[systemType] = newAd;
            } else if (system instanceof DeconSystem) {
                const decon = system as DeconSystem<this>;
                const newDecon = new DeconSystem(ship);

                newDecon.timer = decon.timer;
                newDecon.state = decon.state;

                newSystems[systemType] = newDecon;
            } else if (system instanceof DoorsSystem) {
                const doors = system as DoorsSystem<this>;
                const newDoors = new DoorsSystem(ship);

                newDoors.cooldowns = new Map(doors.cooldowns.entries());
                
                for (let i = 0; i < doors.doors.length; i++) {
                    const door = doors.doors[i];
                    const newDoor = new Door(newDoors, door.id, door.isOpen);
                    newDoors.doors.push(newDoor);
                }

                newSystems[systemType] = newDoors;
            } else if (system instanceof ElectricalDoorsSystem) {
                const electricalDoors = system as ElectricalDoorsSystem<this>;
                const newEd = new ElectricalDoorsSystem(ship);

                for (let i = 0; i < electricalDoors.doors.length; i++) {
                    const door = electricalDoors.doors[i];
                    const newDoor = new Door(newEd, door.id, door.isOpen);
                    newEd.doors.push(newDoor);
                }

                newSystems[systemType] = newEd;
            } else if (system instanceof HqHudSystem) {
                const hqHud = system as HqHudSystem<this>;
                const newHh = new HqHudSystem(ship);

                newHh.timer = hqHud.timer;
                newHh.active = hqHud.active.map(active => ({
                    playerid: active.playerid,
                    consoleid: active.consoleid
                }));
                newHh.completed = new Set(newHh.completed);

                newSystems[systemType] = newHh;
            } else if (system instanceof HudOverrideSystem) {
                const hudOverride = system as HudOverrideSystem<this>;
                const newHo = new HudOverrideSystem(ship);

                (newHo as any)._sabotaged = (hudOverride as any)._sabotaged;

                newSystems[systemType] = newHo;
            } else if (system instanceof LifeSuppSystem) {
                const lifeSupp = system as LifeSuppSystem<this>;
                const newLs = new LifeSuppSystem(ship);

                newLs.timer = lifeSupp.timer;
                newLs.completed = new Set(lifeSupp.completed);

                newSystems[systemType] = newLs;
            } else if (system instanceof MedScanSystem) {
                const medScan = system as MedScanSystem<this>;
                const newMs = new MedScanSystem(ship);

                for (let i = 0; i < medScan.queue.length; i++) {
                    const queuePlayer = medScan.queue[i];
                    const newPlayer = this.players.get(queuePlayer.id);
                    newMs.queue.push(newPlayer!);
                }

                newSystems[systemType] = newMs;
            } else if (system instanceof MovingPlatformSystem) {
                const movingPlatform = system as MovingPlatformSystem<this>;
                const newMp = new MovingPlatformSystem(ship);

                newMp.useId = movingPlatform.useId;
                newMp.side = movingPlatform.side;

                if (movingPlatform.target) {
                    const newTarget = this.players.get(movingPlatform.target.id);
                    newMp.target = newTarget;
                }

                newSystems[systemType] = newMp;
            } else if (system instanceof ReactorSystem) {
                const reactor = system as ReactorSystem<this>;
                const newReactor = new ReactorSystem(ship);

                newReactor.timer = reactor.timer;
                newReactor.completed = new Set(reactor.completed);

                newSystems[systemType] = newReactor;
            } else if (system instanceof SabotageSystem) {
                const sabotage = system as SabotageSystem<this>;
                const newSab = new SabotageSystem(ship);

                newSab.cooldown = sabotage.cooldown;

                newSystems[systemType] = newSab;
            } else if (system instanceof SecurityCameraSystem) {
                const securityCamera = system as SecurityCameraSystem<this>;
                const newSc = new SecurityCameraSystem(ship);

                for (const player of securityCamera.players) {
                    const newPlayer = this.players.get(player.id);
                    newSc.players.add(newPlayer!);
                }

                newSystems[systemType] = newSc;
            } else if (system instanceof SwitchSystem) {
                const switches = system as SwitchSystem<this>;
                const newSwitches = new SwitchSystem(ship);

                newSwitches.expected = [...switches.expected];
                newSwitches.actual = [...switches.actual];
                newSwitches.brightness = switches.brightness;

                newSystems[systemType] = newSwitches;
            }
        }

        return newSystems;
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
        
        const povNotCanceled = [];
        for (let i = 0; i < messages.length; i++) {
            const child = messages[i];

            (child as any)._canceled = false; // child._canceled is private
            await this.outgoingFilter.emitDecoded(child, MessageDirection.Serverbound, undefined);

            if (child.canceled)
                continue;
                
            await this.parentRoom.decoder.emitDecoded(child, MessageDirection.Serverbound, undefined);

            if (child.canceled)
                continue;
            
            povNotCanceled.push(child);
        }

        if (povNotCanceled.length) {
            await this.parentRoom.broadcastMessages(povNotCanceled)
        }
            
        return this.broadcastMessages(messages, payloads, recipientConnection ? [recipientConnection] : undefined);
    }

    createPerspective(player: PlayerData): Perspective;
    createPerspective(players: PlayerData[]): Perspective;
    createPerspective(players: PlayerData|PlayerData[]): Perspective {
        throw new TypeError("Cannot create a perspective from another perspective; create one from the original room instead.");
    }
}