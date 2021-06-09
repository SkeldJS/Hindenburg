import { DisconnectReason, Hostable } from "@skeldjs/core";
import { BaseGameDataMessage, BaseRootMessage, GameDataMessage, GameDataToMessage, JoinedGameMessage, JoinGameMessage, ReliablePacket, RemovePlayerMessage } from "@skeldjs/protocol";
import { Code2Int } from "@skeldjs/util";

import { ClientConnection } from "./Connection";
import { Player } from "./Player";
import { Worker } from "./Worker";

export class Room {
    private readonly _internal: Hostable;
    
    connections: Map<number, ClientConnection>;
    players: Map<number, Player>;

    code: number;

    constructor(
        public readonly worker: Worker
    ) {
        this._internal = new Hostable;

        this.connections = new Map;
        this.players = new Map;

        this.code = 0;
    }

    /**
     * The host player of this room.
     */
    get host() {
        return this.players.get(this._internal.hostid);
    }

    /**
     * Get the internal SkeldJS [Hostable](https://skeldjs.github.io/SkeldJS/classes/core.hostable.html) structure.
     * @example
     * ```ts
     * const room = new Room(worker);
     * console.log(room.getInternal()); // Hostable
     * ```
     */
    getInternal() {
        return this._internal;
    }

    /**
     * Broadcast [GameData messages](https://github.com/codyphobe/among-us-protocol/blob/master/03_gamedata_and_gamedatato_message_types/README.md)
     * and root messages to all or some connections.
     * 
     * Sends GameDataTo if a filter is applied with {@link include}.
     * @param gamedata The [GameData messages](https://github.com/codyphobe/among-us-protocol/blob/master/03_gamedata_and_gamedatato_message_types/README.md)
     * to send.
     * @param payload The [Root messages](https://github.com/codyphobe/among-us-protocol/blob/master/02_root_message_types/README.md)
     * to send.
     * @param include The connections to include in the broadcast.
     * @param exclude The connections to exclude in the broadcast.
     * @returns A promise that resolves when all packages have been sent.
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
        payload: BaseRootMessage[] = [],
        include?: ClientConnection[],
        exclude?: ClientConnection[]
    ) {
        const clientsToBroadcast = include || [...this.connections.values()];
        const clientsToExclude = new Set(exclude);
        const promises: Promise<void>[] = [];

        for (const client of clientsToBroadcast) {
            if (clientsToExclude.has(client))
                continue;

            const messages = [
                ...(gamedata.length ?
                    [
                        include
                            ? new GameDataToMessage(
                                this.code,
                                client.clientid,
                                gamedata
                            )
                            : new GameDataMessage(
                                this.code,
                                gamedata
                            )
                    ]
                    : []),
                ...payload
            ] as BaseRootMessage[];

            promises.push(
                client.sendPacket(
                    new ReliablePacket(
                        client.getNextNonce(),
                        messages
                    )
                )
            );
        }

        await Promise.all(promises);
    }

    /**
     * Handle a client attempting to join this room.
     * 
     * See https://github.com/codyphobe/among-us-protocol/blob/master/02_root_message_types/01_joingame.md
     * for more information.
     * @param client The client that is joining.
     */
    async handleJoin(client: ClientConnection) {
        const playerData = await this._internal.handleJoin(client.clientid);
        if (!playerData)
            throw new Error("Client is already connected to the room.");

        const player = new Player(client, this, playerData);

        if (this.connections?.size === 0) {
            this._internal.hostid = client.clientid;
        }

        await this.broadcastMessages([], [
            new JoinGameMessage(
                this.code,
                client.clientid,
                this._internal.hostid
            )
        ]);

        await client.sendPacket(
            new ReliablePacket(
                client.getNextNonce(),
                [
                    new JoinedGameMessage(
                        this.code,
                        client.clientid,
                        this._internal.hostid,
                        [...this.connections.values()]
                            .map(connection => connection.clientid)
                    )
                ]
            )
        );
        
        this.connections.set(client.clientid, client);
        this.players.set(client.clientid, player);
        client.room = this;
    }

    /**
     * Handling a client leaving or being kicked from the room.
     * @param client The client that is leaving.
     * @param reason The reason for why the client is leaving.
     */
    async handleLeave(client: ClientConnection, reason: DisconnectReason) {
        if (!this.connections.has(client.clientid))
            throw new Error("Client is not connected to the room.");

        await this._internal.handleLeave(client.clientid);

        await this.broadcastMessages([], [
            new RemovePlayerMessage(
                this.code,
                client.clientid,
                reason,
                client.clientid
            )
        ]);

        this.connections.delete(client.clientid);
        this.players.delete(client.clientid);

        if (client.clientid === this._internal.hostid) {
            if (this.connections.size) {
                this._internal.hostid = [...this.connections.values()][0].clientid;
            } else {
                this._internal.hostid = 0;
            }
        }
    }

    /**
     * Set the game code of the room.
     * @param code The game code as either an integer or a string.
     * @example
     * ```ts
     * // Set the code of the room to "ABCDEF";
     * const room = new Room(worker);
     * room.setCode("ABCDEF");
     * ```
     */
    async setCode(code: number|string): Promise<void> {
        if (typeof code === "string") {
            if (code.length !== 4 && code.length !== 6) {
                throw new RangeError("Expected a 4 or 6 digit room code.");
            }

            return this.setCode(Code2Int(code));
        }

        // todo: implement broadcast
        this.code = code;
    }

    /**
     * Change the host of the room.
     * @param host The client to set as host.
     */
    setHost(host: ClientConnection) {
        // todo: implement broadcast
        this._internal.hostid = host.clientid;
    }
}