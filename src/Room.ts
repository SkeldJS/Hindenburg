import {
    DisconnectReason,
    GameOverReason,
    GameState
} from "@skeldjs/constant";

import {
    BaseGameDataMessage,
    BaseRootMessage,
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

import { Code2Int, Int2Code } from "@skeldjs/util";

import { Hostable, PlayerData } from "@skeldjs/core";

import { Client } from "./Client";
import { HindenburgServer } from "./HindenburgServer";

export class Room extends Hostable {
    code: number;
    clients: Map<number, Client>;
    settings: GameOptions;
    state: GameState;
    
    waiting: Set<Client>;

    constructor(private server: HindenburgServer) {
        super({ doFixedUpdate: false });

        this.code = 0;
        this.clients = new Map;
        this.settings = new GameOptions;
        this.state = GameState.NotStarted;
        this.waiting = new Set;
    }

    get name() {
        return Int2Code(this.code);
    }

    get destroyed() {
        return this.state === GameState.Destroyed;
    }

    async destroy() {
        await this.broadcast([], true, null, [
            new RemoveGameMessage(DisconnectReason.Destroy)
        ]);

        this.state = GameState.Destroyed;
        this.server.rooms.delete(this.code);

        this.server.redis.del("room." + this.name);
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
                    new GameDataToMessage(
                        this.code,
                        remote.clientid,
                        messages
                    ),
                    ...payloads
                ];

                await remote.send(
                    reliable
                        ? new ReliablePacket(remote.getNextNonce(), children)
                        : new UnreliablePacket(children)
                );
            }
        } else {
            const children = [
                new GameDataMessage(
                    this.code,
                    messages
                ),
                ...payloads
            ];

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

        this.code = code;

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
                this.host.id
            )
        ]);
    }

    async handleRemoteJoin(client: Client) {
        const player = await super.handleJoin(client.clientid);

        if (!this.host)
            await this.setHost(player);

        client.room = this;

        if (this.state === GameState.Ended) {
            await this.broadcast([], true, null, [
                new JoinGameMessage(
                    this.code,
                    client.clientid,
                    this.host.id
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
                                this.host.id,
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
                        this.host.id,
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
                this.host.id
            )
        ]);
        
        this.clients.set(client.clientid, client);
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