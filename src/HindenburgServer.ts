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
    RpcMessageTag
} from "@skeldjs/constant";

import { Code2Int } from "@skeldjs/util";
import { SpawnPrefabs } from "@skeldjs/core";

import { Room } from "./Room";
import { HindenburgConfig, HindenburgNode } from "./Node";
import { Client, ClientEvents } from "./Client";

export class HindenburgServer extends HindenburgNode<ClientEvents> {
    rooms: Map<number, Room>;

    constructor(config: Partial<HindenburgConfig>) {
        super(config);

        this.rooms = new Map;

        this.decoder.on(HelloPacket, async (message, direction, client) => {
            const was_redirected = await this.redis.hget("redirected." + client.remote.address + "." + client.username, "num");
            
            if (!was_redirected) {
                client.disconnect(
                    DisconnectReason.Custom,
                    "Please connect through the main server."
                );
                return;
            }

            if (was_redirected === "1") {
                await this.redis.del("redirected." + client.remote.address + "." + client.username);
            } else {
                await this.redis.hincrby("redirected." + client.remote.address + "." + client.username, "num", -1);
            }
        });

        this.decoder.on(HostGameMessage, (message, direction, client) => {
            if (!this.checkMods(client))
                return;

            if (this.config.anticheat.checkSettings && !GameOptions.isValid(message.options)) {
                this.logger.warn("Client with ID %s created game with invalid settings.", client.clientid);

                if (client.penalize("checkSettings")) {
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

            this.redis.set("room." + name, this.ip + ":" + this.config.node.port);

            this.logger.info(
                "Client with ID %s created game %s on %s with %s impostors and %s max players.",
                client.clientid, name,
                GameMap[message.options.map], message.options.numImpostors, message.options.maxPlayers
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

        this.decoder.on([ DataMessage, RpcMessage, DespawnMessage ], (message, direction, client) => {
            if (!client.room)
                return;

            const player = client.room.players.get(client.clientid);

            if (!player)
                return;

            const component = client.room.netobjects.get(message.netid);

            if (!component)
                return;
                
            if (
                component.ownerid !== client.clientid
                && !player.ishost
                && client.penalize("checkObjectOwnership")
            ) {
                return;
            }

            client.room.decoder.emitDecoded(message, direction, client);
        });

        this.decoder.on(GameDataMessage, (message, direction, client) => {
            // todo: anti-cheat on Rpc messages

            if (!client.room)
                return;

            client.room.decoder.emitDecoded(message, direction, client);

            for (const [ , cl ] of client.room.clients) {
                cl.send(
                    new ReliablePacket(
                        client.getNextNonce(),
                        [
                            new GameDataMessage(
                                client.room.code,
                                message.children
                            )
                        ]
                    )
                );
            }
        });

        this.decoder.on(SpawnMessage, (message, direction, client) => {
            if (!client.room)
                return;

            const player = client.room.players.get(client.clientid);

            if (!player)
                return;

            if (!player.ishost && client.penalize("hostChecks")) {
                return;
            }

            const prefab = SpawnPrefabs[message.spawnType];
            if (prefab) {
                if (prefab.length !== message.components.length && client.penalize("malformedPackets")) {
                    return;
                }
            }

            client.room.decoder.emitDecoded(message, direction, client);
        });

        this.decoder.on(GameDataToMessage, (message, direction, client) => {
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
                        if (!player.ishost && client.penalize("hostChecks")) {
                            return;
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
                                if (!recipient.ishost && client.penalize("invalidFlow")) {
                                    return;
                                }
                                break;
                            case RpcMessageTag.Exiled:
                            case RpcMessageTag.ClearVote:
                                if (!player.ishost && client.penalize("hostChecks")) {
                                    return;
                                }
                                break;
                        }
                        break;
                    case GameDataMessageTag.Spawn:
                        if ((!player.ishost && !recipient.spawned) && client.penalize("hostChecks")) {
                            return;
                        }
                        break;
                    case GameDataMessageTag.SceneChange:
                        if ((!recipient.ishost || player.spawned) && client.penalize("invalidFlow")) {
                            return;
                        }
                        break;
                    default:
                        if (client.penalize("invalidFlow")) {
                            return;
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

            this.redis.del(infraction_keys);
        });
    }

    get ip() {
        return this.config.node.ip;
    }

    listen() {
        return new Promise<void>(resolve => {
            this.socket.bind(this.config.node.port);
    
            this.socket.on("listening", () => {
                this.logger.info("Listening on *:%s", this.config.node.port);
                resolve();
            });
    
            this.socket.on("message", this.onMessage.bind(this));
        });
    }

    async graceful() {
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
            this.decoder.emitDecoded(parsed, MessageDirection.Serverbound, client);
        } catch (e) {
            this.logger.error("%s", e.stack);
        }
    }
}