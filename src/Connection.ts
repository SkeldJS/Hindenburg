import dgram from "dgram";

import { VersionInfo } from "@skeldjs/util";
import { BaseRootMessage, BaseRootPacket, DisconnectPacket, JoinGameMessage, ReliablePacket, Serializable } from "@skeldjs/protocol";

import { Worker } from "./Worker";
import { Room } from "./Room";
import { DisconnectReason } from "@skeldjs/core";

export class ClientMod {
    constructor(
        public readonly netid: number,
        public readonly modid: string,
        public readonly modversion: string
    ) {}
}

export class SentPacket {
    constructor(
        public readonly nonce: number,
        public readonly buffer: Buffer,
        public sentAt: number,
        public acked: boolean
    ) {}
}

export class ClientConnection {
    /**
     * Whether the client has successfully identified with the server.
     * 
     * Requires the client sending a {@link ModdedHelloPacket} (optional extension
     * of [0x08 Hello](https://github.com/codyphobe/among-us-protocol/blob/master/01_packet_structure/05_packet_types.md#0x08-hello))
     */
    hasIdentified: boolean;
    /**
     * Whether a disconnect packet has been sent to this client.
     * 
     * Used to avoid an infinite loop of sending disconnect confirmations
     * back and forth.
     */
    sentDisconnect: boolean;
    /**
     * Whether this client sent a modded Reactor message, and thus is using a
     * [Reactor](https://reactor.gg) modded client.
     */
    usingReactor: boolean;
    /**
     * The username that this client identified with. Sent with the {@link ClientConnection.hasIdentified identify}
     * packet.
     */
    username: string;
    /**
     * The version of the client's game. Sent with the {@link ClientConnection.hasIdentified identify}
     * packet.
     */
    clientVersion?: VersionInfo;

    /**
     * The number of mods that the client said that they had loaded. Available
     * if the client is using a Reactor modded client.
     */
    numMods: number;
    /**
     * The mods that the client has loaded. Not necessarily complete, see
     * {@link ClientConnection.numMods} to compare the list size whether
     * it is complete.
     */
    mods: ClientMod[];

    /**
     * The last nonce that was received by this client.
     * 
     * Used to prevent duplicate packets with the same nonce.
     */
    lastNonce: number;
    private _incrNonce: number;

    /**
     * An array of the 8 latest packets that were sent to this client. Used to
     * re-send packets that have not been acknowledged.
     */
    sentPackets: SentPacket[];
    /**
     * An array of the 8 latest packet nonces that were received from this client.
     * Used to re-send acknowledgements that the client did not receive.
     */
    receivedPackets: number[];

    /**
     * The round-trip ping for this connection. Calculated very roughly by calculating
     * the time it takes for each reliable packet to be acknowledged.
     */
    roundTripPing: number;

    /**
     * The room that this client is in.
     */
    room?: Room;

    constructor(
        /**
         * The server that this client is connected to.
         */
        public readonly server: Worker,
        /**
         * Remote information about this client.
         */
        public readonly rinfo: dgram.RemoteInfo,
        /**
         * The server-unique client ID for this client, see {@link Worker.getNextClientId}.
         */
        public readonly clientid: number
    ) {
        this.hasIdentified = false;
        this.sentDisconnect = false;
        this.usingReactor = false;
        this.username = "";
        
        this.numMods = 0;
        this.mods = [];

        this.lastNonce = -1;
        this._incrNonce = 0;

        this.sentPackets = [];
        this.receivedPackets = [];

        this.roundTripPing = 0;
    }

    /**
     * A formatted address for this connection.
     * @example
     * ```ts
     * console.log(connection.address); // => 127.0.0.1:22023
     * ```
     */
    get address() {
        return this.rinfo.address + ":" + this.rinfo.port;
    }

    /**
     * Get the next nonce to use for a reliable packet for this connection.
     * @returns An incrementing nonce.
     * @example
     * ```ts
     * console.log(connection.getNextNonce()); // => 1
     * console.log(connection.getNextNonce()); // => 2
     * console.log(connection.getNextNonce()); // => 3
     * console.log(connection.getNextNonce()); // => 4
     * console.log(connection.getNextNonce()); // => 5
     * ```
     */
    getNextNonce() {
        return ++this._incrNonce;
    }

    /**
     * Serialize and reliable or unreliably send a packet to this client.
     * 
     * For reliable packets, packets sent will be reliably recorded and marked
     * for re-sending if the client does not send an acknowledgement for the
     * packet.
     * @param packet The root packet to send.
     * @example
     * ```ts
     * connection.sendPacket(
     *   new ReliablePacket(
     *     connection.getNextNonce(),
     *     [
     *       new HostGameMessage("ALBERT")
     *     ]
     *   )
     * );
     * ```
     */
    async sendPacket(packet: BaseRootPacket) {
        await this.server.sendPacket(this, packet);
    }

    /**
     * Gracefully disconnect the client for this connection.
     * 
     * Note that this does not remove this connection from the server, see {@link Worker.removeConnection}.
     * @param reason The reason for why the client is being disconnected. Set to
     * a string to use a custom message.
     * @param message If the reason is custom, the message for why the client
     * is being disconnected.
     * @example
     * ```ts
     * // Disconnect a player for hacking.
     * await player.connection.disconnect(DisconnectReason.Hacking);
     * ```
     * 
     * ```ts
     * // Disconnect a player for a custom reason.
     * await player.connection.disconnect("You have been very naughty.");
     * ```
     */
    async disconnect(reason?: string | DisconnectReason, message?: string): Promise<void> {
        if (typeof reason === "string") {
            return this.disconnect(DisconnectReason.Custom, reason);
        }

        await this.sendPacket(
            new DisconnectPacket(
                reason,
                message,
                true
            )
        );

        this.sentDisconnect = true;
        this.hasIdentified = false;
        this.usingReactor = false;
        this.username = "";
        this.clientVersion = undefined;
        this.numMods = 0;
        this.mods = [];
    }

    /**
     * Emit an error that occurred while the client attempted to create or join
     * a room.
     * 
     * Note that this does not disconnect the client, see {@link ClientConnection.disconnect}.
     * @param reason The error that the client encountered while creating or
     * joining their room. Set to a string to use a custom message.
     * @param message If the reason is custom, a custom message for the error
     * that the client encountered.
     * @example
     * ```ts
     * // A room that the client tried to join is full.
     * await client.joinError(DisconnectReason.GameFull);
     * 
     * // A room that the client tried to join is already full.
     * await client.joinError(DisconectReason.GameStarted);
     * 
     * // A custom reason for why the client could not join.
     * await client.joinError("Alas, thou art barred from entering said establishment.")
     * ```
     */
    async joinError(reason: string | DisconnectReason, message?: string): Promise<void> {
        if (typeof reason === "string") {
            return this.joinError(DisconnectReason.Custom, reason);
        }

        await this.sendPacket(
            new ReliablePacket(
                this.getNextNonce(),
                [
                    new JoinGameMessage(reason, message)
                ]
            )
        );
    }
}