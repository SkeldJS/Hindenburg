import winston from "winston";
import * as uuid from "uuid";

import {
    Color,
    DisconnectReason,
    GameOverReason,
    GameState
} from "@skeldjs/constant";

import {
    BaseGameDataMessage,
    BaseRootMessage,
    DataMessage,
    EndGameMessage,
    GameDataMessage,
    GameDataToMessage,
    GameOptions,
    HostGameMessage,
    JoinedGameMessage,
    JoinGameMessage,
    ReliablePacket,
    RemoveGameMessage,
    RemovePlayerMessage,
    StartGameMessage,
    UnreliablePacket,
    WaitForHostMessage
} from "@skeldjs/protocol";

import { Code2Int, HazelWriter, Int2Code } from "@skeldjs/util";

import { Hostable, HostableEvents, PlayerData, RoomFixedUpdateEvent } from "@skeldjs/core";

import { Client } from "./Client";
import { WorkerNode } from "./WorkerNode";
import { Anticheat } from "./Anticheat";
import { fmtPlayer } from "./util/format-player";
import { fmtClient } from "./util/format-client";

export class Room extends Hostable {
    logger: winston.Logger;

    uuid: string;

    code: number;
    clients: Map<number, Client>;
    settings: GameOptions;
    state: GameState;
    
    waiting: Set<Client>;

    anticheat: Anticheat;

    constructor(private server: WorkerNode) {
        super();

        this.uuid = uuid.v4();

        this.code = 0;
        this.clients = new Map;
        this.settings = new GameOptions;
        this.state = GameState.NotStarted;
        
        this.waiting = new Set;

        this.anticheat = new Anticheat(this.server, this);
        
        this.logger = winston.createLogger({
            transports: [
                new winston.transports.Console({
                    format: winston.format.combine(
                        winston.format.splat(),
                        winston.format.colorize(),
                        winston.format.printf(info => {
                            return `[${this.name}] ${info.level}: ${info.message}`;
                        }),
                    ),
                }),
                new winston.transports.File({
                    filename: "logs/" + this.uuid + ".txt",
                    format: winston.format.combine(
                        winston.format.splat(),
                        winston.format.simple()
                    )
                })
            ]
        });

        this.on("player.setname", setname => {
            this.logger.info(
                "Player %s changed their name from %s to %s.",
                fmtPlayer(setname.player), setname.oldName, setname.newName
            );
        });
        
        this.on("player.setcolor", setcolor => {
            this.logger.info(
                "Player %s changed their color from %s to %s.",
                fmtPlayer(setcolor.player), Color[setcolor.oldColor], Color[setcolor.newColor]
            );
        });
    }

    get name() {
        return Int2Code(this.code);
    }

    get destroyed() {
        return this.state === GameState.Destroyed;
    }
    
    async emit<Event extends HostableEvents[keyof HostableEvents]>(event: Event): Promise<Event> {
        await super.emit(event);

        return this.server.emit(event);
    }
    
    async FixedUpdate() {
        const delta = Date.now() - (this as any).last_fixed_update;
        (this as any).last_fixed_update = Date.now();
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
                            new DataMessage(component.netid, writer.buffer)
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

        if (this.stream.length) {
            const stream = this.stream;
            this.stream = [];

            if (!ev.canceled) await this.broadcast(stream);
        }
    }

    async destroy() {
        super.destroy();

        await this.broadcast([], true, null, [
            new RemoveGameMessage(DisconnectReason.Destroy)
        ]);

        this.state = GameState.Destroyed;
        this.server.rooms.delete(this.code);

        await this.server.redis.del("room." + this.name);

        this.logger.info("Room was destroyed.");
    }

    async broadcast(
        messages: BaseGameDataMessage[],
        reliable: boolean = true,
        recipient: PlayerData | null = null,
        payloads: BaseRootMessage[] = []
    ) {
        if (recipient) {
            const remote = this.clients.get(recipient.id);

            if (remote) {
                const children = [
                    ...(messages?.length ? [new GameDataToMessage(
                        this.code,
                        remote.clientid,
                        messages
                    )] : []),
                    ...payloads
                ];
                
                if (!children.length)
                    return;

                await remote.send(
                    reliable
                        ? new ReliablePacket(remote.getNextNonce(), children)
                        : new UnreliablePacket(children)
                );
            }
        } else {
            const children = [
                ...(messages?.length ? [new GameDataMessage(
                    this.code,
                    messages
                )] : []),
                ...payloads
            ];

            if (!children.length)
                return;

            await Promise.all(
                [...this.clients]
                    // .filter(([, client]) => !exclude.includes(client))
                    .map(([, client]) => {
                        return client.send(
                            reliable
                                ? new ReliablePacket(client.getNextNonce(), children)
                                : new UnreliablePacket(children)
                        )
                    })
            );
        }
    }

    async setCode(code: number|string): Promise<void> {
        if (typeof code === "string") {
            return this.setCode(Code2Int(code));
        }

        if (this.code) {
            this.logger.info(
                "Game code changed to [%s]",
                Int2Code(code) 
            );
        }

        super.setCode(code);

        await this.broadcast([], true, null, [
            new HostGameMessage(code)
        ]);
    }

    async updateHost(client: Client) {
        await this.broadcast([], true, null, [
            new JoinGameMessage(
                this.code,
                -1,
                client.clientid
            ),
            new RemovePlayerMessage(
                this.code,
                -1,
                DisconnectReason.None,
                client.clientid
            )
        ]);
    }

    async setHost(player: PlayerData) {
        const remote = this.clients.get(player.id);

        await super.setHost(player);

        if (remote && this.state === GameState.Ended && this.waiting.has(remote)) {
            await this.handleRemoteJoin(remote);
        }

        this.logger.info(
            "Host changed to %s",
            fmtPlayer(player)
        );
    }

    async handleRemoteLeave(client: Client, reason: DisconnectReason = DisconnectReason.None) {
        await super.handleLeave(client.clientid);

        this.clients.delete(client.clientid);

        if (this.clients.size === 0) {
            await this.destroy();
            return;
        }

        await this.setHost([...this.players.values()][0]);

        await this.broadcast([], true, null, [
            new RemovePlayerMessage(
                this.code,
                client.clientid,
                reason,
                this.hostid
            )
        ]);

        this.logger.info(
            "%s left or was removed.",
            fmtClient(client)
        );
    }

    async handleRemoteJoin(client: Client) {
        const player = await super.handleJoin(client.clientid);

        if (!player)
            return;

        if (!this.host)
            await this.setHost(player);

        client.room = this;

        if (this.state === GameState.Ended) {
            await this.broadcast([], true, null, [
                new JoinGameMessage(
                    this.code,
                    client.clientid,
                    this.host!.id
                )
            ]);

            if (client.clientid === this.hostid) {
                this.state = GameState.NotStarted;
                
                for (const [ , client ] of this.clients) {
                    if (!this.waiting.has(client)) {
                        this.clients.delete(client.clientid);
                    }
                }

                await Promise.all(
                    [...this.waiting].map(waiting => {
                        return waiting.send(
                            new JoinedGameMessage(
                                this.code,
                                client.clientid,
                                this.host!.id,
                                [...this.clients]
                                    .map(([, client]) => client.clientid)
                            )
                        );
                    })
                );
            } else {
                this.waiting.add(client);
                await client.send(
                    new ReliablePacket(
                        client.getNextNonce(),
                        [
                            new WaitForHostMessage(
                                this.code,
                                client.clientid
                            )
                        ]
                    )
                )
                return;
            }
        }

        await client.send(
            new ReliablePacket(
                client.getNextNonce(),
                [
                    new JoinedGameMessage(
                        this.code,
                        client.clientid,
                        this.host!.id,
                        [...this.clients]
                            .map(([, client]) => client.clientid)
                    )
                ]
            )
        );

        await this.broadcast([], true, null, [
            new JoinGameMessage(
                this.code,
                client.clientid,
                this.host!.id
            )
        ]);
        
        this.clients.set(client.clientid, client);

        this.logger.info(
            "%s joined the game.",
            fmtClient(client)
        );
    }

    async handleStart() {
        this.state = GameState.Started;

        await this.broadcast([], true, null, [
            new StartGameMessage(this.code)
        ]);
    }

    async handleEnd(reason: GameOverReason) {
        this.waiting.clear();
        this.state = GameState.Ended;

        await this.broadcast([], true, null, [
            new EndGameMessage(this.code, reason, false)
        ]);
    }
}