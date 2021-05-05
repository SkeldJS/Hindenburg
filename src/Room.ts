import { DisconnectReason, GameOverReason, GameState } from "@skeldjs/constant";
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
    WaitForHostMessage
} from "@skeldjs/protocol";
import { Code2Int } from "@skeldjs/util";

import { Client } from "./Client";
import { HindenburgServer } from "./HindenburgServer";

export class Room {
    code: number;
    host!: Client;
    clients: Map<number, Client>;
    settings: GameOptions;
    state: GameState;
    
    waiting: Set<Client>;

    constructor(private server: HindenburgServer) {
        this.code = 0;
        this.clients = new Map;
        this.settings = new GameOptions;
        this.state = GameState.NotStarted;
        this.waiting = new Set;
    }

    get destroyed() {
        return this.state === GameState.Destroyed;
    }

    async destroy() {
        await this.broadcast([], [
            new RemoveGameMessage(DisconnectReason.Destroy)
        ]);

        this.state = GameState.Destroyed;
        this.server.rooms.delete(this.code);
    }

    async broadcast(gamedata: BaseGameDataMessage[], payloads: BaseRootMessage[] = [], recipient?: Client/*, exclude: Client[] = []*/) {
        if (recipient) {
            await recipient.send(
                new ReliablePacket(
                    recipient.getNextNonce(),
                    [
                        new GameDataToMessage(
                            this.code,
                            recipient.clientid,
                            gamedata
                        ),
                        ...payloads
                    ]
                )
            );
        } else {
            const messages = [
                new GameDataMessage(
                    this.code,
                    gamedata
                ),
                ...payloads
            ];

            await Promise.all(
                [...this.clients]
                    // .filter(([, client]) => !exclude.includes(client))
                    .map(([, client]) => {
                        return client.send(
                            new ReliablePacket(
                                client.getNextNonce(),
                                messages
                            )
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

        await this.broadcast([], [
            new HostGameMessage(code)
        ]);
    }

    async updateHost(client: Client) {
        await this.broadcast([], [
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

    async setHost(client: Client) {
        this.host = client;

        if (this.state === GameState.Ended && this.waiting.has(client)) {
            await this.handleJoin(client);
        }
    }

    async handleLeave(client: Client, reason: DisconnectReason = DisconnectReason.None) {
        this.clients.delete(client.clientid);

        if (this.clients.size === 0) {
            await this.destroy();
            return;
        }

        await this.setHost([...this.clients.values()][0]);

        await this.broadcast([], [
            new RemovePlayerMessage(
                this.code,
                client.clientid,
                reason,
                this.host.clientid
            )
        ]);
    }

    async handleJoin(client: Client) {
        if (!this.host)
            await this.setHost(client);

        if (this.state === GameState.Ended) {
            await this.broadcast([], [
                new JoinGameMessage(
                    this.code,
                    client.clientid,
                    this.host.clientid
                )
            ], undefined);

            if (client === this.host) {
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
                                this.host.clientid,
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
                        this.host.clientid,
                        [...this.clients]
                            .map(([, client]) => client.clientid)
                    )
                ]
            )
        );

        await this.broadcast([], [
            new JoinGameMessage(
                this.code,
                client.clientid,
                this.host.clientid
            )
        ], undefined);
        
        this.clients.set(client.clientid, client);
    }

    async handleStart() {
        this.state = GameState.Started;

        await this.broadcast([], [
            new StartGameMessage(this.code)
        ]);
    }

    async handleEnd(reason: GameOverReason) {
        this.waiting.clear();
        this.state = GameState.Ended;

        await this.broadcast([], [
            new EndGameMessage(this.code, reason, false)
        ]);
    }
}