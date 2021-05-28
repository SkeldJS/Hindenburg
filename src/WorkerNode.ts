import {
    BaseRootMessage,
    DataMessage,
    DespawnMessage,
    GameDataMessage,
    GameDataToMessage,
    GameOptions,
    HelloPacket,
    HostGameMessage,
    JoinGameMessage,
    MessageDirection,
    ReliablePacket,
    RpcMessage,
    SpawnMessage
} from "@skeldjs/protocol";

import {
    DisconnectReason,
    GameDataMessageTag,
    GameMap,
    GameState,
    RpcMessageTag,
    SpawnType
} from "@skeldjs/constant";

import { Code2Int, Int2Code } from "@skeldjs/util";
import { HostableEvents, SpawnPrefabs } from "@skeldjs/core";

import { ExtractEventTypes } from "@skeldjs/events";

import { Room } from "./Room";
import { HindenburgConfig } from "./Node";
import { MatchmakerNodeEvents, MatchmakerNode } from "./MatchmakerNode";
import { Client, ClientEvents } from "./Client";
import { ModdedHelloPacket } from "./packets";

import { fmtPlayer } from "./util/format-player";
import { WorkerBeforeCreateEvent, WorkerBeforeJoinEvent } from "./events";
import { LoadBalancerNode } from "./LoadBalancerNode";
import { fmtClient } from "./util/format-client";

export type WorkerNodeEvents = ExtractEventTypes<[
    WorkerBeforeCreateEvent,
    WorkerBeforeJoinEvent
]>;

export class WorkerNode extends MatchmakerNode<WorkerNodeEvents & MatchmakerNodeEvents & ClientEvents & HostableEvents> {
    rooms: Map<number, Room>;
    nodeid: number;

    constructor(config: Partial<HindenburgConfig>, nodeid: number, pluginDirectory: string) {
        super(config.cluster!.name + ":" + config.cluster!.ports[nodeid], config, pluginDirectory);

        this.rooms = new Map;
        this.nodeid = nodeid;

        this.decoder.on([ HelloPacket, ModdedHelloPacket ], async (message, direction, client) => {
            if (this.config.loadbalancer) {
                const was_redirected = await this.redis.hget("redirected." + client.remote.address + "." + client.username, "num");
            
                if (was_redirected) {
                    if (was_redirected === "1") {
                        await this.redis.del("redirected." + client.remote.address + "." + client.username);
                    } else {
                        await this.redis.hincrby("redirected." + client.remote.address + "." + client.username, "num", -1);
                    }
                } else {
                    if (!this.config.cluster.allowDirect) {
                        client.disconnect(
                            "Please connect through the main server."
                        );
                        return;
                    }
                }
            }
        });

        this.decoder.on(HostGameMessage, async (message, direction, client) => {
            if (!this.checkClientMods(client))
                return;

            if (this.config.anticheat.checkSettings && !GameOptions.isValid(message.options)) {
                this.logger.warn("%s created room with invalid settings.", fmtClient(client));

                if (await client.penalize("checkSettings")) {
                    return;
                }
            }
            
            const chars = [];
            for (let i = 0; i < 6; i++) {
                chars.push(~~(Math.random() * 26) + 65);
            }
            const name = String.fromCharCode(...chars);
            const code = Code2Int(name);

            const ev = await this.emit(
                new WorkerBeforeCreateEvent(client, message.options, code)
            );

            if (!ev.canceled) {
                const room = await this.createRoom(ev.gameCode, ev.gameOptions);
                
                this.logger.info(
                    "%s created room %s on %s with %s impostors and %s max players (%s).",
                    fmtClient(client), name,
                    GameMap[message.options.map], message.options.numImpostors, message.options.maxPlayers, room.uuid
                );

                client.send(
                    new ReliablePacket(
                        client.getNextNonce(),
                        [
                            new HostGameMessage(code)
                        ]
                    )
                );
            }
        });

        this.decoder.on(JoinGameMessage, async (message, direction, client) => {
            if (!this.checkClientMods(client))
                return;
            
            const foundRoom = this.rooms.get(message.code);

            const ev = await this.emit(
                new WorkerBeforeJoinEvent(client, message.code, foundRoom)
            );

            if (!ev.canceled) {
                const room = ev.foundRoom;
                if (!room)
                    return client.joinError(DisconnectReason.GameNotFound);
    
                if (room.clients.size >= room.settings.maxPlayers)
                    return client.joinError(DisconnectReason.GameFull);
    
                if (room.state === GameState.Started)
                    return client.joinError(DisconnectReason.GameStarted);
    
                room.handleRemoteJoin(client);
            }
        });

        this.decoder.on([ DataMessage, RpcMessage, DespawnMessage ], async (message, direction, client) => {
            if (!client.room)
                return;

            const player = client.room.players.get(client.clientid);

            if (!player)
                return;

            const component = client.room.netobjects.get(message.netid);

            if (!component)
                return message.cancel();
                
            if (
                component.ownerid !== client.clientid
                && !player.ishost
            ) {
                client.room.logger.warn(
                    "Player %s had data for or despawned %s but was not its owner.",
                    fmtPlayer(player), message.netid
                );

                if (await client.penalize("checkObjectOwnership")) {
                    if (message.tag === GameDataMessageTag.RPC) {
                        message.data.cancel();
                    }
                    return message.cancel();
                }
            }
        });

        this.decoder.on(RpcMessage, async (message, direction, client) => {
            if (message.canceled || message.data.canceled)
                return;

            if (!client.room)
                return;

            const player = client.room.players.get(client.clientid);

            if (!player)
                return;
            
            const component = client.room.netobjects.get(message.netid);

            if (!component) {
                client.room.logger.warn(
                    "Player %s had an Rpc for component with netid %s but it did not exist.",
                    fmtPlayer(player), message.netid
                );
                return message.cancel();
            }

            await client.room.anticheat.emitDecoded(message.data, direction, {
                component,
                player,
                client
            });
        });

        this.decoder.on(SpawnMessage, async (message, direction, client) => {
            if (!client.room)
                return;

            const player = client.room.players.get(client.clientid);

            if (!player)
                return;

            if (!player.ishost) {
                client.room.logger.warn(
                    "Player %s spawned object %s but isn't the host.",
                    fmtPlayer(player), SpawnType[message.spawnType]
                );

                if (await client.penalize("hostChecks")) {
                    return message.cancel();
                }
            }

            const prefab = SpawnPrefabs[message.spawnType];
            if (prefab) {
                if (prefab.length !== message.components.length) {
                    client.room.logger.warn(
                        "Player %s spawned object %s with invalid components (%s).",
                        fmtPlayer(player), SpawnType[message.spawnType], message.components.length
                    );
                }

                if (await client.penalize("malformedPackets")) {
                    return message.cancel();
                }
            }
            client.room.decoder.emitDecoded(message, direction, client);
            message.cancel();
        });

        this.decoder.on(GameDataMessage, async (message, direction, client) => {
            if (!client.room)
                return;
                
            const player = client.room.players.get(client.clientid);

            if (!player)
                return;
                
            const children = message.children
                .filter(child => !child.canceled);

            if (!children.length)
                return;

            for (const child of children) {
                client.room.decoder.emitDecoded(child, direction, client);
            }

            for (const [ , cl ] of client.room.clients) {
                if (cl === client)
                    continue;

                cl.send(
                    new ReliablePacket(
                        cl.getNextNonce(),
                        [
                            new GameDataMessage(
                                client.room.code,
                                children
                            )
                        ]
                    )
                );
            }
        });

        this.decoder.on(GameDataToMessage, async (message, direction, client) => {
            if (!client.room)
                return;

            const player = client.room.players.get(client.clientid);
            const recipient = client.room.players.get(message.recipientid);

            const recipclient = client.room.clients.get(message.recipientid);

            if (!recipient || !player || !recipclient)
                return;

            for (const gamedata of message._children) {
                switch (gamedata.tag) {
                    case GameDataMessageTag.Data:
                        if (!player.ishost && await client.penalize("hostChecks")) {
                            return message.cancel();
                        }
                        break;
                    case GameDataMessageTag.RPC:
                        const rpc = gamedata as RpcMessage;
                        switch (rpc.data.tag) {
                            case RpcMessageTag.CheckName:
                            case RpcMessageTag.CheckColor:
                            case RpcMessageTag.CastVote:
                            case RpcMessageTag.CloseDoorsOfType:
                            case RpcMessageTag.RepairSystem:
                                if (!recipient.ishost) {
                                    client.room.logger.warn(
                                        "Player %s tried to send Rpc %s but the recipient wasn't the host.",
                                        fmtPlayer(player), RpcMessageTag[rpc.data.tag]
                                    );

                                    if (await client.penalize("invalidFlow")) {
                                        return message.cancel();
                                    }
                                }
                                break;
                            case RpcMessageTag.Exiled:
                            case RpcMessageTag.ClearVote:
                                if (!player.ishost) {
                                    client.room.logger.warn(
                                        "Player %s tried to send Rpc %s but they weren't the host.",
                                        fmtPlayer(player), RpcMessageTag[rpc.data.tag]
                                    );

                                    if (await client.penalize("hostChecks")) {
                                        return message.cancel();
                                    }
                                }
                                break;
                        }
                        break;
                    case GameDataMessageTag.Spawn:
                        if (!player.ishost) {
                            client.room.logger.warn(
                                "Player %s tried to send a spawn but they weren't the host.",
                                fmtPlayer(player)
                            );

                            if (recipient.spawned) {
                                client.room.logger.warn(
                                    "Player %s tried to send a spawn but the recipient had already spawned.",
                                    fmtPlayer(player)
                                );

                                if (await client.penalize("hostChecks")) {
                                    return message.cancel();
                                }
                            }
                        }
                        break;
                    case GameDataMessageTag.SceneChange:
                        if (!recipient.ishost) {
                            client.room.logger.warn(
                                "Player %s tried to change scene but the recipient wasn't the host.",
                                fmtPlayer(player)
                            );

                            if (player.spawned) {
                                client.room.logger.warn(
                                    "Player %s tried to change scene but they had already spawned.",
                                    fmtPlayer(player)
                                );

                                if (await client.penalize("invalidFlow")) {
                                    return message.cancel();
                                }
                            }
                        }
                        break;
                    default:
                        client.room.logger.warn(
                            "Player %s sent a message with tag %s that is never sent in GameDataTo messages.",
                            fmtPlayer(player), message.tag
                        );
                        if (await client.penalize("invalidFlow")) {
                            return message.cancel();
                        }
                }
            }

            recipclient.send(
                new ReliablePacket(
                    recipclient.getNextNonce(),
                    [
                        new GameDataToMessage(
                            client.room.code,
                            recipclient.clientid,
                            message._children
                        )
                    ]
                )
            );
        });

        this.on("client.disconnect", async disconnect => {
            await this.redis.srem(
                "connections." + disconnect.client.remote.address,
                disconnect.client.address
            );

            const infraction_keys = await this.redis.keys("infractions." + this.listeningIp + "." + disconnect.client.clientid + ".*");

            if (infraction_keys.length) this.redis.del(infraction_keys);
        });
    }

    get listeningIp() {
        return this.config.cluster.ip;
    }

    get listeningPort() {
        return this.config.cluster.ports[this.nodeid];
    }

    isLoadBalancer(): this is LoadBalancerNode {
        return false;
    }

    beginListen() {
        return new Promise<void>(resolve => {
            this.socket.bind(this.listeningPort);
    
            this.socket.on("listening", () => {
                this.logger.info("Listening on *:%s", this.listeningPort);
                resolve();
            });
    
            this.socket.on("message", this.onMessage.bind(this));
        });
    }

    async beginGracefulShutdown() {
        this.logger.info(
            "Performing graceful shutdown on %s room(s) and %s client(s)..",
            this.rooms.size, this.clients.size
        );

        for (const [ , room ] of this.rooms) {
            await room.destroy();
        }

        for (const [ , client ] of this.clients) {
            await client.disconnect("Server is shutting down.");
        }

        this.socket.close();

        this.logger.info(
            "Gracefully shutdown server, goodbye."
        );
    }

    async handleInitialMessage(parsed: BaseRootMessage, client: Client) {
        await this.redis.sadd(
            "connections." + client.remote.address,
            client.address
        );
        
        const num_connections = await this.redis.scard("connections." + client.remote.address);

        if (num_connections && this.config.anticheat.maxConnectionsPerIp > 0) {
            if (num_connections > this.config.anticheat.maxConnectionsPerIp) {
                client.disconnect("Too many connections coming from your IP.");
                return;
            }
        }

        try {
            await this.emitDecoded(parsed, MessageDirection.Serverbound, client);
        } catch (e) {
            this.logger.error("%s", e.stack);
        }
    }

    async createRoom(code: number, options: GameOptions) {
        const roomName = Int2Code(code);
        if (this.rooms.has(code)) {
            throw new Error("There is already a room with code " + roomName + ".");
        }

        const room = new Room(this);
        room.settings.patch(options);
        room.setCode(code);
        this.rooms.set(code, room);

        this.redis.set("room." + roomName, this.listeningIp + ":" + this.listeningPort);
        return room;
    }
}
