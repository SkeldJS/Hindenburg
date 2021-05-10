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
    SetNameMessage,
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

import { Code2Int } from "@skeldjs/util";
import { SpawnPrefabs } from "@skeldjs/core";

import { Room } from "./Room";
import { HindenburgConfig } from "./Node";
import { MatchmakingNode } from "./MatchmakingNode";
import { Client, ClientEvents } from "./Client";
import { ModdedHelloPacket } from "./packets";

import { fmtName } from "./util/format-name";

export class WorkerNode extends MatchmakingNode<ClientEvents> {
    rooms: Map<number, Room>;
    nodeid: number;

    constructor(config: Partial<HindenburgConfig>, nodeid: number) {
        super(config.cluster!.name + ":" + config.cluster!.ports[nodeid], config);

        this.rooms = new Map;
        this.nodeid = nodeid;

        this.decoder.on([ HelloPacket, ModdedHelloPacket ], async (message, direction, client) => {
            if (this.config.loadbalancer) {
                const was_redirected = await this.redis.hget("redirected." + client.remote.address + "." + client.username, "num");
            
                if (!was_redirected) {
                    client.disconnect(
                        DisconnectReason.Custom,
                        "Please connect through the main server."
                    );
                    return;
                }

                console.log(was_redirected);
    
                if (was_redirected === "1") {
                    await this.redis.del("redirected." + client.remote.address + "." + client.username);
                } else {
                    await this.redis.hincrby("redirected." + client.remote.address + "." + client.username, "num", -1);
                }
            }
        });

        this.decoder.on(HostGameMessage, async (message, direction, client) => {
            if (!this.checkMods(client))
                return;

            if (this.config.anticheat.checkSettings && !GameOptions.isValid(message.options)) {
                this.logger.warn("Client with ID %s created room with invalid settings.", client.clientid);

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

            const room = new Room(this);
            room.settings.patch(message.options);
            room.setCode(code);
            this.rooms.set(code, room);

            this.redis.set("room." + name, this.ip + ":" + this.port);

            this.logger.info(
                "Client with ID %s created room %s on %s with %s impostors and %s max players (%s).",
                client.clientid, name,
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
        });

        this.decoder.on(JoinGameMessage, (message, direction, client) => {
            if (!this.checkMods(client))
                return;
            
            const room = this.rooms.get(message.code);

            if (!room)
                return client.joinError(DisconnectReason.GameNotFound);

            if (room.clients.size >= room.settings.maxPlayers)
                return client.joinError(DisconnectReason.GameFull);

            if (room.state === GameState.Started)
            return client.joinError(DisconnectReason.GameStarted);

            const host = room.clients.get(room.hostid);

            if (typeof this.config.reactor === "object") {
                if (host?.mods && this.config.reactor.requireHostMods) {
                    if (!client.mods)
                        return;

                    if (host.mods.length !== client.mods.length)
                        return;

                    for (const cmod of client.mods) {
                        const found = host.mods
                            .find(mod => mod.id === cmod.id);

                        
                        if (found) {
                            if (found.version !== cmod.version) {
                                return client.joinError(
                                    DisconnectReason.Custom,
                                    "Invalid version for mod %s: %s (Needs %s).",
                                    cmod.id, cmod.version, found.version
                                );
                            }
                        } else {
                            return client.joinError(
                                DisconnectReason.Custom,
                                "Invalid mod loaded: %s (%s)",
                                cmod.id, cmod.version
                            );
                        }
                    }
                    
                    for (const hmod of host.mods) {
                        const found = client.mods
                            .find(mod => mod.id === hmod.id);

                        
                        if (!found) {
                            return client.joinError(
                                DisconnectReason.Custom,
                                "Missing mod: %s (%s)",
                                hmod.id, hmod.version
                            );
                        }
                    }
                }
            }

            room.handleRemoteJoin(client);
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
                    fmtName(player), message.netid
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
                    fmtName(player), message.netid
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
                    fmtName(player), SpawnType[message.spawnType]
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
                        fmtName(player), SpawnType[message.spawnType], message.components.length
                    );
                }

                if (await client.penalize("malformedPackets")) {
                    return message.cancel();
                }
            }
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
                await client.room.decoder.emitDecoded(child, direction, client);
            }

            for (const [ , cl ] of client.room.clients) {
                if (cl === client)
                    continue;

                cl.send(
                    new ReliablePacket(
                        client.getNextNonce(),
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
                                        fmtName(player), RpcMessageTag[rpc.data.tag]
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
                                        fmtName(player), RpcMessageTag[rpc.data.tag]
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
                                fmtName(player)
                            );

                            if (recipient.spawned) {
                                client.room.logger.warn(
                                    "Player %s tried to send a spawn but the recipient had already spawned.",
                                    fmtName(player)
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
                                fmtName(player)
                            );

                            if (player.spawned) {
                                client.room.logger.warn(
                                    "Player %s tried to change scene but they had already spawned.",
                                    fmtName(player)
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
                            fmtName(player), message.tag
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
            const connections = await this.redis.get("connections." + disconnect.client.remote.address);

            if (connections === "1") {
                this.redis.del("connections." + disconnect.client.remote.address);
            } else {
                this.redis.decr("connections." + disconnect.client.remote.address);
            }
            
            const infraction_keys = await this.redis.keys("infractions." + this.ip + "." + disconnect.client.clientid + ".*");

            if (infraction_keys.length) this.redis.del(infraction_keys);
        });
    }

    get ip() {
        return this.config.cluster.ip;
    }

    get port() {
        return this.config.cluster.ports[this.nodeid];
    }

    listen() {
        return new Promise<void>(resolve => {
            this.socket.bind(this.port);
    
            this.socket.on("listening", () => {
                this.logger.info("Listening on *:%s", this.port);
                resolve();
            });
    
            this.socket.on("message", this.onMessage.bind(this));
        });
    }

    async gracefulShutdown() {
        this.logger.info(
            "Performing graceful shutdown on %s room(s) and %s client(s)..",
            this.rooms.size, this.clients.size
        );

        for (const [ , room ] of this.rooms) {
            await room.destroy();
        }

        for (const [ , client ] of this.clients) {
            await client.disconnect(DisconnectReason.Custom, "Server is shutting down.");
        }

        this.socket.close();

        this.logger.info(
            "Gracefully shutdown server, goodbye."
        );
    }

    async handleInitial(parsed: BaseRootMessage, client: Client) {
        const num_connections = await this.redis.incr("connections." + client.remote.address);

        if (num_connections && this.config.anticheat.maxConnectionsPerIp > 0) {
            if (num_connections > this.config.anticheat.maxConnectionsPerIp) {
                client.disconnect(
                    DisconnectReason.Custom,
                    "Too many connections coming from your IP."
                );
                return;
            }
        }

        try {
            await this.emitDecoded(parsed, MessageDirection.Serverbound, client);
        } catch (e) {
            this.logger.error("%s", e.stack);
        }
    }
}