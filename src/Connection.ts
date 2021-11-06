import dgram from "dgram";
import chalk from "chalk";

import { DisconnectReason, Language, QuickChatMode } from "@skeldjs/constant";
import { DisconnectMessages } from "@skeldjs/data";
import { ModPluginSide } from "@skeldjs/reactor";
import { VersionInfo } from "@skeldjs/util";

import {
    BaseRootPacket,
    DisconnectPacket,
    JoinGameMessage,
    ReliablePacket,
    RemoveGameMessage
} from "@skeldjs/protocol";

import { ClientDisconnectEvent } from "./api";

import { Worker } from "./Worker";
import { Room } from "./Room";
import { fmtCode } from "./util/fmtCode";
import { fmtLogFormat } from "./util/fmtLogFormat";
import { ClientLeaveEvent } from "./api/events/client/ClientLeave";

export class ClientMod {
    constructor(
        public readonly netId: number,
        public readonly modId: string,
        public readonly modVersion: string,
        public readonly networkSide: ModPluginSide
    ) {}

    [Symbol.for("nodejs.util.inspect.custom")]() {
        return chalk.green(this.modId) + chalk.grey("@" + this.modVersion);
    }
}

export class SentPacket {
    constructor(
        public readonly nonce: number,
        public readonly buffer: Buffer,
        public sentAt: number,
        public acked: boolean
    ) {}
}

const logLanguages = {
    [Language.English]: "english",
    [Language.SpanishAmericas]: "spanish (latin america)",
    [Language.PortugueseBrazil]: "portuguese (brazil)",
    [Language.Portuguese]: "portuguese",
    [Language.Korean]: "korean",
    [Language.Russian]: "russian",
    [Language.Dutch]: "netherlands",
    [Language.Filipino]: "filipino",
    [Language.French]: "french",
    [Language.German]: "german",
    [Language.Italian]: "italian",
    [Language.Japanese]: "japanese",
    [Language.Spanish]: "spanish",
    [Language.ChineseSimplified]: "chinese (simplified)",
    [Language.ChineseTraditional]: "chinese (traditional)",
    [Language.Irish]: "irish"
};

export const locales = {
    [Language.English]: "en",
    [Language.SpanishAmericas]: "es_US",
    [Language.PortugueseBrazil]: "pt_BR",
    [Language.Portuguese]: "pt",
    [Language.Korean]: "ko",
    [Language.Russian]: "ru",
    [Language.Dutch]: "nl",
    [Language.Filipino]: "fil",
    [Language.French]: "fr",
    [Language.German]: "de",
    [Language.Italian]: "it",
    [Language.Japanese]: "ja",
    [Language.Spanish]: "es_ES",
    [Language.ChineseSimplified]: "zh",
    [Language.ChineseTraditional]: "zh",
    [Language.Irish]: "ga"
};

export class Connection {
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
     * The username that this client identified with. Sent with the {@link Connection.hasIdentified identify}
     * packet.
     */
    username: string;

    /**
     * The chat mode setting that the client has enabled.
     */
    chatMode: QuickChatMode;

    /**
     * The language that the client identified with.
     */
    language: Language;

    /**
     * The version of the client's game. Sent with the {@link Connection.hasIdentified identify}
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
     * {@link Connection.numMods} to compare the list size whether
     * it is complete.
     */
    mods: Map<string, ClientMod>;

    /**
     * The game that the client is waiting to join. Used internally to allow
     * Hindenburg to wait for all mods to be received from the client before
     * allowing them to join a game.
     */
    awaitingToJoin: number;

    /**
     * The last nonce that was received by this client.
     *
     * Used to prevent duplicate packets with the same nonce.
     */
    nextExpectedNonce: number;
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
     * A map of messages that were sent out-of-order to allow the server to execute
     * them when needed.
     */
    unorderedMessageMap: Map<number, BaseRootPacket>;

    /**
     * The room that this client is in.
     */
    room?: Room;

    constructor(
        /**
         * The server that this client is connected to.
         */
        public readonly worker: Worker,
        /**
         * Remote information about this client.
         */
        public readonly remoteInfo: dgram.RemoteInfo,
        /**
         * The server-unique client ID for this client, see {@link Worker.getNextClientId}.
         */
        public readonly clientId: number
    ) {
        this.hasIdentified = false;
        this.sentDisconnect = false;
        this.usingReactor = false;
        this.username = "";
        this.chatMode = QuickChatMode.FreeChat;
        this.language = Language.English;

        this.numMods = 0;
        this.mods = new Map;
        this.awaitingToJoin = 0;

        this.nextExpectedNonce = 0;
        this._incrNonce = 0;

        this.sentPackets = [];
        this.receivedPackets = [];

        this.roundTripPing = 0;
        this.unorderedMessageMap = new Map;
    }

    [Symbol.for("nodejs.util.inspect.custom")]() {
        const paren = fmtLogFormat(
            this.worker.config.logging.connections?.format || ["id", "ip", "ping", "room"],
            {
                id: this.clientId,
                ip: this.worker.config.logging.hideSensitiveInfo
                    ? undefined
                    : this.remoteInfo.address,
                ping: this.roundTripPing + "ms",
                room: this.room ? fmtCode(this.room.code) : undefined,
                language: (logLanguages as any)[this.language]
            }
        );

        return chalk.blue(this.username || "Unidentified")
            + (paren ? " " + chalk.grey("(" + paren + ")") : "");
    }

    /**
     * A formatted address for this connection.
     * @example
     * ```ts
     * console.log(connection.address); // => 127.0.0.1:22023
     * ```
     */
    get address() {
        return this.remoteInfo.address + ":" + this.remoteInfo.port;
    }

    /**
     * Get this client's player in the room that they're connected to.
     * @example
     * ```ts
     * connection.player.setName("obama");
     * ```
     */
    getPlayer() {
        const playerPerspective = this.room?.playerPerspectives.get(this.clientId);
        if (playerPerspective) {
            return playerPerspective.players.get(this.clientId);
        }

        return this.room?.players.get(this.clientId);
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
        await this.worker.sendPacket(this, packet);
    }

    getLocale(i18n: Record<typeof locales[keyof typeof locales], string>) {
        const myLocale = locales[this.language] || this.worker.config.defaultLanguage;
        const myI18n = i18n[myLocale] || i18n[this.worker.config.defaultLanguage];
        if (!myI18n)
            return undefined;

        return myI18n;
    }

    fgetLocale(i18n: Record<typeof locales[keyof typeof locales], string>, ...fmt: string[]) {
        const locale = this.getLocale(i18n);
        const formatted = locale?.replace(/%\d+/g, x => {
            return fmt[parseInt(x.slice(1)) - 1];
        });
        return formatted;
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
    async disconnect(reason?: string | DisconnectReason | Record<string, string>, ...message: string[]): Promise<void> {
        if (typeof reason === "object") {
            const formatted = this.fgetLocale(reason, ...message);
            if (!formatted)
                return this.disconnect(DisconnectReason.None);

            return this.disconnect(DisconnectReason.Custom, formatted);
        }

        if (typeof reason === "string") {
            return this.disconnect(DisconnectReason.Custom, reason);
        }

        const messageJoined = message.join(" ");
        await this.sendPacket(
            new DisconnectPacket(
                reason,
                messageJoined,
                true
            )
        );

        this.worker.logger.info("%s disconnected: %s (%s)",
            this, reason ? DisconnectReason[reason] : "None", (messageJoined || DisconnectMessages[reason as keyof typeof DisconnectMessages] || "No message."));

        this.sentDisconnect = true;
        this.hasIdentified = false;
        this.usingReactor = false;
        this.username = "";
        this.language = Language.English;
        this.clientVersion = undefined;
        this.numMods = 0;
        this.mods = new Map;

        this.worker.removeConnection(this);

        if (this.room) {
            await this.room.emit(
                new ClientLeaveEvent(
                    this,
                    this.room
                )
            );
            await this.room.handleRemoteLeave(this, reason || DisconnectReason.None);
        }

        await this.worker.emit(
            new ClientDisconnectEvent(
                this,
                reason!,
                messageJoined
            )
        );
    }

    /**
     * Emit an error that occurred while the client attempted to create or join
     * a room.
     *
     * Note that this does not disconnect the client, see {@link Connection.disconnect}.
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
    async joinError(reason: string | DisconnectReason | Record<string, string> = DisconnectReason.None, ...message: string[]): Promise<void> {
        if (typeof reason === "object") {
            const formatted = this.fgetLocale(reason, ...message);
            if (!formatted)
                return this.disconnect(DisconnectReason.None);

            return this.disconnect(DisconnectReason.Custom, formatted);
        }

        if (typeof reason === "string") {
            return this.joinError(DisconnectReason.Custom, reason);
        }

        const messageJoined = message.join(" ");
        await this.sendPacket(
            new ReliablePacket(
                this.getNextNonce(),
                [
                    new JoinGameMessage(reason, messageJoined)
                ]
            )
        );

        this.worker.logger.info("%s join error: %s (%s)",
            this, reason, (messageJoined || DisconnectMessages[reason as keyof typeof DisconnectMessages] || "No message."));
    }

    /**
     * Force this client to leave their current game. Primarily for {@link Room.destroy}
     * although exposed as a function for any other possible uses.
     *
     * Sends a [RemoveGame](https://github.com/codyphobe/among-us-protocol/blob/master/02_root_message_types/03_removegame.md)
     * packet and does not immediately disconnect, although the client should do
     * this shortly after receiving the message.
     * @param reason The reason to close the game.
     */
    async leaveRoom(reason = DisconnectReason.ServerRequest) {
        await this.sendPacket(
            new ReliablePacket(
                this.getNextNonce(),
                [
                    new RemoveGameMessage(reason)
                ]
            )
        );
        await this.room?.handleRemoteLeave(this, reason);
        this.room = undefined;
    }

    getModByNetId(netId: number) {
        for (const [ , clientMod ] of this.mods) {
            if (clientMod.netId === netId) {
                return clientMod;
            }
        }
        return undefined;
    }
}
