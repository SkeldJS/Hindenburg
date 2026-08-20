import * as chalk from "chalk";
import * as Koa from "koa";
import koaBody from "koa-body";
import * as http from "http";
import * as https from "https";
import * as crypto from "crypto";

import * as KoaRouter from "@koa/router";
import { HazelWriter } from "@skeldjs/hazel";
import { RoomCode, Version } from "@skeldjs/au-client";
import { DisconnectReason, Filters, GameKeyword, GameMap, GameMode, GameState, Platform, QuickChatMode, StringName } from "@skeldjs/au-core";

import { WaterwayServer } from "./WaterwayServer";
import { Room, RoomPrivacy, logMaps } from "./Room";
import { Logger } from "./Logger";
import { AuthCache } from "./AuthCache";

export type GameListingJson = {
    IP: number;
    Port: number;
    GameId: number;
    HostName: string;
    TrueHostName: string;
    PlayerCount: number;
    Age: number;
    MapId: number;
    NumImpostors: number;
    MaxPlayers: number;
    Platform: number;
    HostPlatformName: string;
    Language: number;
    QuickChat: number;
    Options: string;
}

export type ErrorJson = {
    Reason: keyof typeof DisconnectReason;
}

export type GameFoundByCodeJson = {
    Errors: ErrorJson[] | null;
    Game: GameListingJson | null;
    Region: number;
    UntranslatedRegion: string;
}

export type PlayerListingJson = {
    ClientId: number;
    Username: string;
    Color: number;
    HatId: string;
    SkinId: string;
    VisorId: string;
    IsHost: boolean;
    IsDead: boolean;
}

export type GameInfoJson = GameListingJson & {
    Players: PlayerListingJson[];
    GameState: string;
    GameMode: string;
    Privacy: string;
}

export type FilterTagJson = {
    Name: string;
    DisplayName: string;
    Type: string;
    Count: number;
}

export type MatchmakerTokenPayload = {
    Content: {
        Puid: string;
        ClientVersion: number;
        ExpiresAt: string;
    };
    Hash: string;
}

export type SubFilterJson = {
    AcceptedValues: number;
    FilterType: "map";
}|{
    AcceptedValues: boolean[];
    OptionEnum: number;
    FilterType: "bool";
}|{
    AcceptedValues: number;
    FilterType: "chat";
}|{
    AcceptedValues: number;
    FilterType: "language";
}|{
    AcceptedValues: number[];
    OptionEnum: number;
    FilterType: "cat";
}|{
    AcceptedValues: number[];
    OptionEnum: number;
    FilterType: "int";
};

export type FiltersListJson = {
    FilterSets: {
        GameMode: number;
        Filters: {
            OptionType: string;
            Key: string;
            SubFilterString: string;
        }[]
    }[];
}

export type IntRange = { min: number; max: number; };

export enum FilterPlayerSpeed {
    Low,
    Medium,
    High,
    VeryHigh,
}

export const playerSpeedRanges: Record<FilterPlayerSpeed, IntRange> = {
    [FilterPlayerSpeed.Low]: { min: 0.5, max: 0.75 },
    [FilterPlayerSpeed.Medium]:{ min: 1, max: 1.5 },
    [FilterPlayerSpeed.High]: { min: 1.75, max: 2.25 },
    [FilterPlayerSpeed.VeryHigh]: { min: 2.5, max: 3.0 },
};

export enum FilterKillCooldown {
    Low,
    Medium,
    High,
    VeryHigh,
}

export const killCooldownRanges: Record<FilterKillCooldown, IntRange> = {
    [FilterKillCooldown.Low]: { min: 10, max: 20 },
    [FilterKillCooldown.Medium]:{ min: 22.5, max: 35 },
    [FilterKillCooldown.High]: { min: 37.5, max: 47.5 },
    [FilterKillCooldown.VeryHigh]: { min: 50, max: 60 },
};

export enum FilterVotingTime {
    Low,
    Medium,
    High,
    VeryHigh,
}

export const votingTimeRanges: Record<FilterVotingTime, IntRange> = {
    [FilterVotingTime.Low]: { min: 0, max: 80 },
    [FilterVotingTime.Medium]:{ min: 75, max: 135 },
    [FilterVotingTime.High]: { min: 150, max: 210 },
    [FilterVotingTime.VeryHigh]: { min: 225, max: 300 },
};

export enum FilterHidingTime {
    Low,
    Medium,
    High,
}

export const hidingTimeRanges: Record<FilterHidingTime, IntRange> = {
    [FilterHidingTime.Low]: { min: 160, max: 180 },
    [FilterHidingTime.Medium]:{ min: 200, max: 240 },
    [FilterHidingTime.High]: { min: 260, max: 300 },
};

export enum FilterFinalHideTime {
    Low,
    Medium,
    High,
    VeryHigh
}

export const finalHideTimeRanges: Record<FilterFinalHideTime, IntRange> = {
    [FilterFinalHideTime.Low]: { min: 30, max: 45 },
    [FilterFinalHideTime.Medium]:{ min: 50, max: 70 },
    [FilterFinalHideTime.High]: { min: 75, max: 95 },
    [FilterFinalHideTime.VeryHigh]: { min: 100, max: 120 },
};

export type FilterSets = {
    gameMap?: GameMap[];
    chatMode?: QuickChatMode;
    languages?: GameKeyword;

    impostors?: number[];
    roles?: boolean;
    playerSpeeds?: IntRange[];
    killCooldowns?: IntRange[];
    votingTimes?: IntRange[];
    visualTasks?: boolean;
    anonymousVotes?: boolean;
    confirmEjects?: boolean;

    flashlightMode?: boolean;
    hidingTime?: IntRange[];
    finalHideTime?: IntRange[];
    maxVentUses?: number[];
    
    tag?: number[];
};

// Why oh why does AU send a list of booleans!!!
// - A list of [true, false] is the same as the filter
// not being active!
function resolveBoolFilter(acceptedValues: boolean[]): boolean|null {
    const on = acceptedValues.indexOf(true) !== -1;
    const off = acceptedValues.indexOf(false) !== -1;
    if (on && off) return null;
    return on;
}

function resolveCategoryFilter<T extends string|number|symbol, K>(
    values: Record<T, K>,
    acceptedValues: number[]
): K[] {
    const resolved = [];
    for (const killCooldown of acceptedValues) {
        const range = values[killCooldown as T];
        if (!range) continue;
        resolved.push(range);
    }
    return resolved;
}

function withinAnyRange(ranges: IntRange[], val: number): boolean {
    return ranges.find(range => val >= range.min && val <= range.max) !== undefined;
}

function silentJsonParse(jsonString: string) {
    try {
        return JSON.parse(jsonString);
    } catch (e) {
        return undefined;
    }
}

function isLoopbackAddress(ip: string|undefined) {
    if (!ip) return false;
    return /^127\.([0-9]{1,3})\.([0-9]{1,3})\.([0-9]{1,3})$/i.test(ip) ||
        /^::1$/.test(ip)
}

export class Matchmaker {
    logger: Logger;

    httpServer: http.Server|undefined;
    privateKey: Buffer;

    /** AuthCache shared with WaterwayServer for UDP handshake matching. */
    authCache: AuthCache;

    constructor(protected readonly server: WaterwayServer) {
        this.logger = new Logger(chalk.redBright("Http"), this.server.vorpal);
        this.privateKey = crypto.randomBytes(128);
        this.authCache = new AuthCache();
    }

    /**
     * Decode a JWT token and extract the PUID from the `sub` claim.
     * Does NOT verify the signature — we only need the payload.
     * JWT format: base64url(header).base64url(payload).base64url(signature)
     */
    extractPuidFromJwt(eosToken: string): string | null {
        try {
            const parts = eosToken.split(".");
            if (parts.length !== 3) return null;

            // Decode the payload (second part)
            const payload = Buffer.from(parts[1], "base64url").toString("utf8");
            const json = JSON.parse(payload);

            // Among Us EOS tokens use `sub` for PUID
            return json.sub || json.puid || null;
        } catch {
            return null;
        }
    }

    /**
     * Fetch the FriendCode for a PUID from the Innersloth backend.
     * Uses the EOS Bearer token for authorization.
     */
    async fetchFriendCodeFromBackend(eosToken: string, puid: string): Promise<string | null> {
        return new Promise((resolve) => {
            const url = "https://backend.innersloth.com/api/user/username";

            const req = https.get(url, {
                headers: {
                    "Authorization": "Bearer " + eosToken,
                    "User-Agent": "UnityPlayer/2022.3.44f1 (UnityWebRequest/1.0, libcurl/7.84.0-DEV)",
                    "X-Unity-Version": "2022.3.44f1",
                    "Accept": "application/vnd.api+json",
                },
                timeout: 15000,
            }, (res) => {
                let data = "";
                res.on("data", (chunk: Buffer) => data += chunk.toString());
                res.on("end", () => {
                    try {
                        if (res.statusCode !== 200) {
                            this.logger.warn(
                                "Innersloth backend returned %s for PUID %s",
                                res.statusCode, puid
                            );
                            resolve(null);
                            return;
                        }

                        const doc = JSON.parse(data);

                        // JSON:API format: { data: { attributes: { username, discriminator } } }
                        // Also support flat format: { username, discriminator }
                        let attrs: any;
                        if (doc.data && doc.data.attributes) {
                            attrs = doc.data.attributes;
                        } else {
                            attrs = doc;
                        }

                        const username = attrs.username;
                        const discriminator = attrs.discriminator;

                        if (username && discriminator) {
                            resolve(`${username}#${discriminator}`);
                        } else {
                            this.logger.warn(
                                "Innersloth response missing username/discriminator for PUID=%s. Response: %s",
                                puid, data.substring(0, 200)
                            );
                            resolve(null);
                        }
                    } catch (e) {
                        this.logger.error("Error parsing Innersloth response: %s", e);
                        resolve(null);
                    }
                });
            });

            req.on("error", (e) => {
                this.logger.error("Error fetching FriendCode from backend: %s", e.message);
                resolve(null);
            });

            req.on("timeout", () => {
                req.destroy();
                this.logger.warn("Timeout fetching FriendCode from backend for PUID %s", puid);
                resolve(null);
            });
        });
    }

    /**
     * Generate a fallback FriendCode from a PUID hash.
     * Ensures the same PUID always gets the same fallback code.
     */
    generateFallbackFriendCode(puid: string): string {
        const hash = crypto.createHash("sha256").update(puid).digest();
        const discriminator = hash.readUInt16LE(0) % 10000;
        return `Player#${discriminator.toString().padStart(4, "0")}`;
    }

    get port() {
        return typeof this.server.config.matchmaker === "boolean" ? 80 : this.server.config.matchmaker.port;
    }

    getRandomWorkerPort() {
        const allPorts = [this.server.config.socket.port, ...this.server.config.socket.additionalPorts];
        return allPorts[~~(Math.random() * allPorts.length)];
    }

    /**
     * Resolve the delta port for the requesting client from its matchmaker token.
     * If the client was assigned a dynamic port (delta ports enabled), returns it
     * (making sure its listener is alive and the lease confirmed) — otherwise 0.
     */
    private async resolveRequestPort(ctx: KoaRouter.RouterContext): Promise<number> {
        const deltaPort = this.getRequestDeltaPort(ctx);
        if (deltaPort > 0 && this.server.portPool) {
            // Keep the lease alive and the delta listener up until the client connects.
            this.server.portPool.confirmPort(deltaPort);
            try {
                await this.server.startDeltaListener(deltaPort);
            } catch (e) {
                this.logger.error("Failed to (re)start delta listener on port %s: %s", deltaPort, (e as Error).message);
                return 0;
            }
        }
        return deltaPort;
    }

    /**
     * Decode the `Port` field from the request's Bearer matchmaker token.
     * Returns 0 when there is no token / no delta port.
     */
    private getRequestDeltaPort(ctx: KoaRouter.RouterContext): number {
        const authorization = ctx.headers.authorization;
        if (!authorization) return 0;

        const [tokenType, token] = authorization.split(" ");
        if (!tokenType || !token || tokenType !== "Bearer") return 0;

        try {
            const json = JSON.parse(Buffer.from(token, "base64").toString("utf8"));
            const port = json?.Port;
            return typeof port === "number" && port > 0 ? port : 0;
        } catch {
            return 0;
        }
    }

    /**
     * Store authentication data and, when dynamic delta ports are enabled,
     * allocate a dedicated per-player port for this session. Awaits the delta
     * listener to be fully bound before returning, so the client never connects
     * to a socket that isn't ready yet.
     *
     * When delta ports are disabled, the auth is stored by username so the client
     * (which connects to the shared socket) is still matched — PUID/FriendCode
     * keep working without dynamic ports.
     *
     * @returns `{ deltaPort, isFull }` — `isFull` is true only when the pool is
     * enabled but exhausted (the caller must reject the client).
     */
    private async storeAuthAndAllocatePort(
        username: string,
        puid: string,
        friendCode: string,
        clientVersion: number
    ): Promise<{ deltaPort: number; isFull: boolean }> {
        // No dynamic ports configured → shared socket + username auth.
        if (!this.server.portPool || !this.server.portPool.isEnabled) {
            this.authCache.addAuthByUsername(username, puid, friendCode, clientVersion);
            return { deltaPort: 0, isFull: false };
        }

        const alloc = this.server.portPool.allocatePort(puid);
        if (alloc.port === 0) {
            // Pool exhausted → reject (no IP fallback by design).
            return { deltaPort: 0, isFull: true };
        }

        this.authCache.addAuthByPort(alloc.port, username, puid, friendCode, clientVersion);

        // Await the delta listener to be fully bound BEFORE returning the
        // response, otherwise the client may connect to a socket that isn't
        // ready yet and its first packets get dropped.
        try {
            await this.server.startDeltaListener(alloc.port);
        } catch (e) {
            this.logger.error("Failed to start delta listener on port %s: %s", alloc.port, (e as Error).message);
            this.authCache.removeByPort(alloc.port);
            await this.server.returnDeltaPort(alloc.port);
            return { deltaPort: 0, isFull: true };
        }

        return { deltaPort: alloc.port, isFull: false };
    }

    generateMatchmakerToken(puid: string, clientVersion: number, deltaPort = 0) {
        const payloadContent = {
            Puid: puid,
            ClientVersion: clientVersion,
            ExpiresAt: new Date().toISOString()
        };

        const payloadString = JSON.stringify(payloadContent);
        const computedHash = crypto.createHmac("sha256", this.privateKey).update(payloadString).digest();

        const payload = {
            Content: payloadContent,
            Hash: computedHash.toString("base64"),
            Port: deltaPort
        };

        return Buffer.from(JSON.stringify(payload), "utf8").toString("base64");
    }

    verifyMatchmakerToken(token: string) {
        const decodedToken = Buffer.from(token, "base64").toString("utf8");
        const json = silentJsonParse(decodedToken) as MatchmakerTokenPayload;
        
        if (!json)
            return new TypeError("Invalid JSON");

        if (!json.Hash)
            return new TypeError("No payload content hash");

        if (typeof json.Hash !== "string")
            return new TypeError("Invalid payload content hash");

        if (!json.Content)
            return new TypeError("No payload content");

        if (typeof json.Content !== "object")
            return new TypeError("Invalid payload content");

        if (!json.Content.Puid || typeof json.Content.Puid !== "string")
            return new TypeError("Invalid Puid");

        if (!json.Content.ClientVersion || typeof json.Content.ClientVersion !== "number")
            return new TypeError("Invalid ClientVersion");

        if (!json.Content.ExpiresAt || typeof json.Content.ExpiresAt !== "string")
            return new TypeError("Invalid ExpiresAt");

        const payloadString = JSON.stringify(json.Content);
        const computedHash = crypto.createHmac("sha256", this.privateKey).update(payloadString).digest();

        const providedHash = Buffer.from(json.Hash, "base64");

        if (crypto.timingSafeEqual(providedHash, computedHash))
            return true;

        return new Error("Invalid payload content hash ");
    }

    verifyRequest(ctx: KoaRouter.RouterContext) {
        const authorization = ctx.headers.authorization;

        if (!authorization)
            return false;

        const [tokenType, token] = authorization.split(" ");

        if (!tokenType || !token || tokenType !== "Bearer")
            return false;

        const verifyToken = this.verifyMatchmakerToken(token);
        if (verifyToken instanceof Error) {
            if (this.server.config.logging.hideSensitiveInfo) {
                this.logger.warn("Invalid request to %s: %s",
                    ctx.originalUrl, verifyToken.message);
            } else {
                const address = ctx.socket.address();

                if ("port" in address) {
                    this.logger.warn("Invalid request to %s from %s:%s: %s",
                        ctx.originalUrl, address.address, address.port, verifyToken.message);
                } else {
                    this.logger.warn("Invalid request to %s: %s",
                        ctx.originalUrl, verifyToken.message);
                }
            }
            return false;
        }

        return true;
    }

    getGameListing(fromAddress: string, room: Room): GameListingJson {
        const listingIp = isLoopbackAddress(fromAddress)
            ? "127.0.0.1"
            : this.server.config.socket.ip;

        const settingsWriter = HazelWriter.alloc(256);
        settingsWriter.write(room.settings, false, 10);

        const roomAge = Math.floor((Date.now() - room.createdAt) / 1000);
        const gameListing: GameListingJson = {
            IP: Buffer.from(listingIp.split(".").map(x => parseInt(x))).readUInt32LE(0),
            Port: this.getRandomWorkerPort(),
            GameId: room.code.id,
            HostName: room.roomName,
            TrueHostName: room.playerAuthority?.username || "Server",
            PlayerCount: room.players.size,
            Age: roomAge,
            MapId: room.settings.map,
            NumImpostors: room.settings.numImpostors,
            MaxPlayers: room.settings.maxPlayers,
            Platform: room.playerAuthority?.platform.platformTag || Platform.Unknown,
            HostPlatformName: room.playerAuthority?.platform.platformName || "UNKNOWN",
            Language: room.settings.keywords,
            QuickChat: room.playerAuthority
                ? (room.getConnection(room.playerAuthority)?.chatMode ?? QuickChatMode.FreeChat)
                : QuickChatMode.FreeChat,
            Options: settingsWriter.toString("base64"),
        };
        return gameListing;
    }

    protected createKoaServer() {
        const koaServer = new Koa;
        koaServer.use(koaBody());

        const router = new KoaRouter;
        for (const [, loadedPlugin] of this.server.loadedPlugins) {
            for (let i = 0; i < loadedPlugin.loadedMatchmakerEndpoints.length; i++) {
                const { method, route, body } = loadedPlugin.loadedMatchmakerEndpoints[i];

                router[method](route, body.bind(loadedPlugin.pluginInstance) as any);
            }
        }

        // ── Root / Home Page ──
        router.get("/", async (ctx) => {
            const totalPlayers = [...this.server.connections.values()].filter(c => c.room).length;
            const totalConnections = this.server.connections.size;
            const totalRooms = this.server.rooms.size;

            const publicRooms = [...this.server.rooms.values()]
                .filter(r => r.privacy === RoomPrivacy.Public);

            const roomRows = publicRooms.slice(0, 20).map(room => {
                const mapName = logMaps[room.settings.map] || GameMap[room.settings.map] || "Unknown";
                const modeName = GameMode[room.settings.gameMode] || "Normal";
                const stateName = GameState[room.gameState] || "Lobby";
                const roomAge = Math.floor((Date.now() - room.createdAt) / 1000);
                const ageStr = roomAge < 60 ? `${roomAge}s` : `${Math.floor(roomAge / 60)}m`;

                return `<tr>
                    <td><code>${room.code}</code></td>
                    <td>${room.roomName}</td>
                    <td>${room.players.size}/${room.settings.maxPlayers}</td>
                    <td>${mapName}</td>
                    <td>${modeName}</td>
                    <td>${stateName}</td>
                    <td>${ageStr}</td>
                </tr>`;
            }).join("");

            const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Waterway — Among Us Server</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            background: #0d1117;
            color: #c9d1d9;
            min-height: 100vh;
        }
        header {
            background: linear-gradient(135deg, #161b22 0%, #1a2332 100%);
            border-bottom: 1px solid #30363d;
            padding: 32px 24px;
            text-align: center;
        }
        header h1 {
            font-size: 2rem;
            font-weight: 700;
            background: linear-gradient(90deg, #58a6ff, #3fb950);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }
        header p {
            color: #8b949e;
            margin-top: 8px;
            font-size: 0.95rem;
        }
        .stats {
            display: flex;
            justify-content: center;
            gap: 32px;
            margin: 24px auto 0;
            flex-wrap: wrap;
        }
        .stat-card {
            background: #161b22;
            border: 1px solid #30363d;
            border-radius: 8px;
            padding: 16px 28px;
            text-align: center;
            min-width: 120px;
        }
        .stat-card .num {
            font-size: 1.8rem;
            font-weight: 700;
            color: #58a6ff;
        }
        .stat-card .label {
            font-size: 0.8rem;
            color: #8b949e;
            margin-top: 4px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        main {
            max-width: 960px;
            margin: 32px auto;
            padding: 0 16px;
        }
        h2 {
            font-size: 1.2rem;
            color: #e6edf3;
            margin-bottom: 16px;
            padding-bottom: 8px;
            border-bottom: 1px solid #30363d;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            font-size: 0.9rem;
        }
        th {
            text-align: left;
            padding: 10px 12px;
            background: #161b22;
            color: #8b949e;
            font-weight: 600;
            font-size: 0.8rem;
            text-transform: uppercase;
            letter-spacing: 0.3px;
            border-bottom: 1px solid #30363d;
        }
        td {
            padding: 10px 12px;
            border-bottom: 1px solid #21262d;
        }
        tr:hover td { background: #161b22; }
        code {
            background: #21262d;
            padding: 2px 6px;
            border-radius: 4px;
            font-size: 0.85rem;
            color: #d2a8ff;
            letter-spacing: 2px;
        }
        .empty {
            text-align: center;
            color: #8b949e;
            padding: 40px 0;
        }
        footer {
            text-align: center;
            padding: 24px;
            color: #484f58;
            font-size: 0.8rem;
            border-top: 1px solid #30363d;
            margin-top: 48px;
        }
        .endpoints {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
            gap: 12px;
            margin-top: 16px;
        }
        .ep {
            background: #161b22;
            border: 1px solid #30363d;
            border-radius: 6px;
            padding: 12px 16px;
        }
        .ep .method {
            display: inline-block;
            padding: 2px 8px;
            border-radius: 4px;
            font-size: 0.75rem;
            font-weight: 700;
            margin-right: 8px;
        }
        .ep .method.get  { background: #1b3a1b; color: #3fb950; }
        .ep .method.post { background: #1b2d4a; color: #58a6ff; }
        .ep .method.put  { background: #3a2e0e; color: #d29922; }
        .ep .path { font-family: monospace; font-size: 0.85rem; color: #e6edf3; }
        .ep .desc { font-size: 0.78rem; color: #8b949e; margin-top: 4px; }
    </style>
</head>
<body>
    <header>
        <h1>⚓ Waterway</h1>
        <p>Among Us Custom Server &mdash; v${WaterwayServer.serverVersion}</p>
        <div class="stats">
            <div class="stat-card">
                <div class="num">${totalRooms}</div>
                <div class="label">Rooms</div>
            </div>
            <div class="stat-card">
                <div class="num">${totalPlayers}</div>
                <div class="label">Players In-Game</div>
            </div>
            <div class="stat-card">
                <div class="num">${totalConnections}</div>
                <div class="label">Connections</div>
            </div>
            <div class="stat-card">
                <div class="num">${this.server.loadedPlugins.size}</div>
                <div class="label">Plugins</div>
            </div>
        </div>
    </header>

    <main>
        <h2>📡 Active Rooms</h2>
        ${roomRows
            ? `<table>
                <thead><tr>
                    <th>Code</th><th>Host</th><th>Players</th><th>Map</th><th>Mode</th><th>State</th><th>Age</th>
                </tr></thead>
                <tbody>${roomRows}</tbody>
            </table>`
            : `<div class="empty">No active rooms. Host a game to get started!</div>`}

        <h2 style="margin-top: 40px;">🔌 API Endpoints</h2>
        <div class="endpoints">
            <div class="ep">
                <span class="method get">GET</span><span class="path">/</span>
                <div class="desc">This page — server overview</div>
            </div>
            <div class="ep">
                <span class="method post">POST</span><span class="path">/api/user</span>
                <div class="desc">Get a matchmaker authentication token</div>
            </div>
            <div class="ep">
                <span class="method get">GET</span><span class="path">/api/games/:id</span>
                <div class="desc">Get detailed info for a specific room</div>
            </div>
            <div class="ep">
                <span class="method get">GET</span><span class="path">/api/games/filtered</span>
                <div class="desc">Search and filter public rooms</div>
            </div>
            <div class="ep">
                <span class="method post">POST</span><span class="path">/api/games</span>
                <div class="desc">Find host IP/port for a game code</div>
            </div>
            <div class="ep">
                <span class="method get">GET</span><span class="path">/api/filters</span>
                <div class="desc">List available search filters</div>
            </div>
            <div class="ep">
                <span class="method get">GET</span><span class="path">/api/filtertags</span>
                <div class="desc">Dynamic filter tags from active rooms</div>
            </div>
        </div>
    </main>

    <footer>
        Waterway v${WaterwayServer.serverVersion} &middot; Cluster: ${this.server.config.clusterName} &middot; Node #${this.server.config.nodeId}
    </footer>
</body>
</html>`;

            ctx.type = "text/html";
            ctx.status = 200;
            ctx.body = html;
        });

        router.post("/api/user", async (ctx) => {
            const body = (ctx.request as any).body;
            if (ctx.req.headers["content-type"] !== "application/json") {
                this.logger.warn("Client failed to get a matchmaker token: Invalid Content-Type header (%s)", ctx.headers["content-type"]);
                ctx.status = 400;
                return;
            }

            if (typeof body.Username !== "string") {
                this.logger.warn("Client failed to get a matchmaker token: No 'Username' provided in body");
                ctx.status = 400;
                return;
            }

            if (typeof body.ClientVersion !== "number") {
                this.logger.warn("Client %s failed to get a matchmaker token: No 'ClientVersion' provided in body", chalk.blue(body.Username));
                ctx.status = 400;
                ctx.body = "";
                return;
            }

            if (!this.server.isVersionAccepted(Version.fromEncoded(body.ClientVersion))) {
                this.logger.warn("Client %s failed to get a matchmaker token: Outdated or invalid client version: %s %s",
                    chalk.blue(body.Username), Version.fromEncoded(body.ClientVersion).toString(), chalk.grey("(" + body.ClientVersion + ")"));
                ctx.status = 400;
                return;
            }

            if (typeof body.Language !== "number") {
                this.logger.warn("Client failed to get a matchmaker token: No 'Language' provided in body");
                ctx.status = 400;
                return;
            }

            // ── Extract PUID ──
            // Priority: 1) Authorization header (EOS JWT Bearer token)
            //           2) body.Puid field (legacy / direct)
            let puid: string | null = null;
            let deltaPort = 0;
            let isFull = false;

            const authHeader = ctx.headers.authorization;
            if (authHeader && authHeader.startsWith("Bearer ")) {
                const eosToken = authHeader.substring("Bearer ".length);
                puid = this.extractPuidFromJwt(eosToken);

                if (puid) {
                    // Fetch FriendCode from Innersloth backend
                    let friendCode = await this.fetchFriendCodeFromBackend(eosToken, puid);

                    if (!friendCode) {
                        friendCode = this.generateFallbackFriendCode(puid);
                        this.logger.info("Using fallback FriendCode for %s: %s", chalk.blue(body.Username), friendCode);
                    } else {
                        this.logger.info("Got FriendCode from backend for %s: %s", chalk.blue(body.Username), friendCode);
                    }

                    // Get client IP (support reverse proxy headers)
                    let clientIp = ctx.socket.remoteAddress || "127.0.0.1";
                    const xRealIp = ctx.headers["x-real-ip"] as string;
                    const xForwardedFor = ctx.headers["x-forwarded-for"] as string;
                    if (xRealIp) {
                        clientIp = xRealIp;
                    } else if (xForwardedFor) {
                        clientIp = xForwardedFor.split(",")[0].trim();
                    }
                    // Normalize IPv4-mapped IPv6
                    if (clientIp.startsWith("::ffff:")) {
                        clientIp = clientIp.substring(7);
                    }

                    // Store auth (delta port if enabled, else username for shared socket)
                    const authResult = await this.storeAuthAndAllocatePort(body.Username, puid, friendCode, body.ClientVersion);
                    deltaPort = authResult.deltaPort;
                    isFull = authResult.isFull;

                    if (this.server.config.logging.hideSensitiveInfo) {
                        this.logger.info("Client %s authenticated (PUID=XXXX, FriendCode=%s)",
                            chalk.blue(body.Username), friendCode);
                    } else {
                        this.logger.info("Client %s authenticated (PUID=%s, FriendCode=%s, IP=%s)",
                            chalk.blue(body.Username), puid, friendCode, clientIp);
                    }
                } else {
                    this.logger.warn("Could not extract PUID from JWT for %s", chalk.blue(body.Username));
                }
            } else if (typeof body.Puid === "string") {
                // Legacy path: PUID provided directly in body
                puid = body.Puid;

                const friendCode = this.generateFallbackFriendCode(puid!);
                const authResult = await this.storeAuthAndAllocatePort(body.Username, puid!, friendCode, body.ClientVersion);
                deltaPort = authResult.deltaPort;
                isFull = authResult.isFull;

                this.logger.info("Client %s got token via legacy PUID path (FriendCode=%s, DeltaPort=%s)",
                    chalk.blue(body.Username), friendCode, deltaPort);
            }

            if (!puid) {
                this.logger.warn("Client %s failed to get a matchmaker token: No PUID available (no Authorization header or body.Puid)", chalk.blue(body.Username));
                ctx.status = 400;
                ctx.body = JSON.stringify({ error: "No PUID available" });
                return;
            }

            if (isFull) {
                // Dynamic ports are the only matching mechanism — refuse when the pool is exhausted.
                this.logger.warn("Client %s rejected: no dynamic port available (pool exhausted)", chalk.blue(body.Username));
                ctx.status = 503;
                ctx.body = JSON.stringify({ error: "Server full: no available connection ports" });
                return;
            }

            const mmToken = this.generateMatchmakerToken(puid, body.ClientVersion, deltaPort);
            ctx.status = 200;
            ctx.body = mmToken;
        });

        router.post("/api/games", async ctx => {
            if (!this.verifyRequest(ctx)) {
                ctx.status = 401;
                return;
            }

            if (!ctx.query.gameId) {
                this.logger.warn("Client failed to find host for room: No 'gameId' provided in query parameters");
                ctx.status = 400;
                return;
            }

            const deltaPort = await this.resolveRequestPort(ctx);

            const listingIp = isLoopbackAddress(ctx.socket.remoteAddress) ? "127.0.0.1" : this.server.config.socket.ip;

            ctx.status = 200;
            ctx.body = {
                Ip: Buffer.from(listingIp.split(".").map(x => parseInt(x))).readUInt32LE(0),
                Port: deltaPort || this.getRandomWorkerPort()
            };
        });

        router.put("/api/games", async ctx => {
            if (!this.verifyRequest(ctx)) {
                ctx.status = 401;
                return;
            }

            const deltaPort = await this.resolveRequestPort(ctx);

            const listingIp = isLoopbackAddress(ctx.socket.remoteAddress) ? "127.0.0.1" : this.server.config.socket.ip;

            ctx.status = 200;
            ctx.body = {
                Ip: Buffer.from(listingIp.split(".").map(x => parseInt(x))).readUInt32LE(0),
                Port: deltaPort || this.getRandomWorkerPort()
            };
        });

        router.get("/api/games/filtered", ctx => {
            if (!this.verifyRequest(ctx)) {
                ctx.status = 401;
                return;
            }

            if (typeof ctx.query.filter !== "string") {
                this.logger.warn("Client failed to find games: no 'filter' provided in query parameters");
                ctx.status = 400;
                return;
            }

            const filtersListData: FiltersListJson = JSON.parse(ctx.query.filter);

            // I'm not exactly sure what the behaviour of the other filter sets would be,
            // presumably a union. However, this is not relevant because the game does not
            // use more than one.
            const primaryFilterSet = filtersListData.FilterSets[0];

            const filterSets: Partial<FilterSets> = {};
            for (const filter of primaryFilterSet.Filters) {
                const subFilter: SubFilterJson = JSON.parse(filter.SubFilterString);
                switch (filter.Key) {
                    case "Map":
                        if (subFilter.FilterType === "map") {
                            filterSets.gameMap = [];
                            // AU sends a bitfield for maps here. This is legacy, but
                            // they do this anyway instead of sending an array like a
                            // normal dev team.
                            const allGameMaps = Object.values(GameMap).filter(map => typeof map === "number");
                            for (const gameMap of allGameMaps) {
                                if (subFilter.AcceptedValues & (1 << gameMap)) {
                                    filterSets.gameMap.push(gameMap);
                                }
                            }
                        }
                        break;
                    case "Roles":
                        if (subFilter.FilterType === "bool") {
                            const resolved = resolveBoolFilter(subFilter.AcceptedValues);
                            if (resolved === null) break;
                            filterSets.roles = resolved;
                        }
                        break;
                    case "Chat":
                        if (subFilter.FilterType === "chat") {
                            filterSets.chatMode = subFilter.AcceptedValues;
                        }
                        break;
                    case "Language":
                        if (subFilter.FilterType === "language") {
                            // Game uses GameKeyword instead of Languages enum to fit with
                            // legacy game options system
                            filterSets.languages = subFilter.AcceptedValues;
                        }
                        break;
                    case "PlayerSpeed":
                        if (subFilter.FilterType === "cat") {
                            filterSets.playerSpeeds = resolveCategoryFilter(playerSpeedRanges, subFilter.AcceptedValues);
                        }
                        break;
                    case "KillCooldown":
                        if (subFilter.FilterType === "cat") {
                            filterSets.killCooldowns = resolveCategoryFilter(killCooldownRanges, subFilter.AcceptedValues);
                        }
                        break;
                    case "VisualTasks":
                        if (subFilter.FilterType === "bool") {
                            const resolved = resolveBoolFilter(subFilter.AcceptedValues);
                            if (resolved === null) break;
                            filterSets.visualTasks = resolved;
                        }
                        break;
                    case "AnonymousVotes":
                        if (subFilter.FilterType === "bool") {
                            const resolved = resolveBoolFilter(subFilter.AcceptedValues);
                            if (resolved === null) break;
                            filterSets.anonymousVotes = resolved;
                        }
                        break;
                    case "ConfirmEjects":
                        if (subFilter.FilterType === "bool") {
                            const resolved = resolveBoolFilter(subFilter.AcceptedValues);
                            if (resolved === null) break;
                            filterSets.confirmEjects = resolved;
                        }
                        break;
                    case "Tag":
                        if (subFilter.FilterType === "int") {
                            filterSets.tag = subFilter.AcceptedValues;
                        }
                        break;
                    case "VotingTime":
                        if (subFilter.FilterType === "cat") {
                            filterSets.votingTimes = resolveCategoryFilter(votingTimeRanges, subFilter.AcceptedValues);
                        }
                        break;
                    case "ImpostorNumber":
                        if (subFilter.FilterType === "int") {
                            filterSets.impostors = subFilter.AcceptedValues;
                        }
                        break;
                    case "MaxVentUses":
                        if (subFilter.FilterType === "int") {
                            filterSets.maxVentUses = subFilter.AcceptedValues;
                        }
                        break;
                    case "FlashlightMode":
                        if (subFilter.FilterType === "bool") {
                            const resolved = resolveBoolFilter(subFilter.AcceptedValues);
                            if (resolved === null) break;
                            filterSets.flashlightMode = resolved;
                        }
                        break;
                    case "HidingTime":
                        if (subFilter.FilterType === "cat") {
                            filterSets.hidingTime = resolveCategoryFilter(hidingTimeRanges, subFilter.AcceptedValues);
                        }
                        break;
                    case "FinalHideTime":
                        if (subFilter.FilterType === "cat") {
                            filterSets.finalHideTime = resolveCategoryFilter(finalHideTimeRanges, subFilter.AcceptedValues);
                        }
                        break;
                }
            }

            const ignoreSearchTerms = Array.isArray(this.server.config.gameListing.ignoreSearchTerms)
                ? new Set(this.server.config.gameListing.ignoreSearchTerms)
                : this.server.config.gameListing.ignoreSearchTerms;

            const gamesAndRelevance: [number, GameListingJson][] = [];
            for (const [gameCode, room] of this.server.rooms) {
                // TODO: make this defined somewhere- magic number, scary!
                if (gameCode === 0x20 /* local game */) continue;

                if (!this.server.config.gameListing.ignorePrivacy && room.privacy === RoomPrivacy.Private)
                    continue;

                if (typeof ignoreSearchTerms === "boolean" && ignoreSearchTerms) {
                    const gameListing = this.getGameListing(ctx.socket.remoteAddress || "", room);
                    gamesAndRelevance.push([0, gameListing]);
                    continue;
                }

                if (primaryFilterSet.GameMode !== room.settings.gameMode) continue;

                // How BAD of a match this is!
                var badMatchScore = 0;

                if (filterSets.gameMap && !filterSets.gameMap.includes(room.settings.map)) badMatchScore++;
                if (filterSets.chatMode !== undefined && filterSets.chatMode !== room.createdBy?.chatMode) badMatchScore++;
                if (filterSets.languages !== undefined && filterSets.languages !== room.settings.keywords) badMatchScore++;

                switch (primaryFilterSet.GameMode) {
                case GameMode.None: continue;
                case GameMode.Normal:
                case GameMode.NormalFools:
                    if (filterSets.impostors && !filterSets.impostors.includes(room.settings.numImpostors)) badMatchScore++;
                    if (filterSets.roles !== undefined) {
                        const roomHasRoles = Object.values(room.settings.roleSettings.roleChances)
                            .find(role => role.chance > 0) !== undefined;

                        if (roomHasRoles !== filterSets.roles) badMatchScore++;
                    }
                    if (filterSets.playerSpeeds) {
                        if (!withinAnyRange(filterSets.playerSpeeds, room.settings.playerSpeed)) badMatchScore++;
                    }
                    if (filterSets.killCooldowns) {
                        if (!withinAnyRange(filterSets.killCooldowns, room.settings.killCooldown)) badMatchScore++;
                    }
                    if (filterSets.votingTimes) {
                        if (!withinAnyRange(filterSets.votingTimes, room.settings.votingTime)) badMatchScore++;
                    }
                    if (filterSets.visualTasks !== undefined && filterSets.visualTasks !== room.settings.visualTasks) badMatchScore++;
                    if (filterSets.anonymousVotes !== undefined && filterSets.anonymousVotes !== room.settings.anonymousVotes) badMatchScore++;
                    if (filterSets.confirmEjects !== undefined && filterSets.confirmEjects !== room.settings.confirmEjects) badMatchScore++;
                    break;
                case GameMode.HideNSeek:
                case GameMode.HideNSeekFools:
                    if (filterSets.flashlightMode !== undefined && filterSets.flashlightMode !== room.settings.useFlashlight) badMatchScore++;
                    if (filterSets.hidingTime) {
                        if (!withinAnyRange(filterSets.hidingTime, room.settings.hidingTime)) badMatchScore++;
                    }
                    if (filterSets.finalHideTime) {
                        if (!withinAnyRange(filterSets.finalHideTime, room.settings.finalHideTime)) badMatchScore++;
                    }
                    if (filterSets.maxVentUses && !filterSets.maxVentUses.includes(room.settings.crewmateVentUses)) badMatchScore++;
                    break;
                }

                if (badMatchScore > 0 && this.server.config.gameListing.requireExactMatches)
                    continue;

                gamesAndRelevance.push([
                    badMatchScore,
                    this.getGameListing(ctx.socket.remoteAddress || "", room),
                ]);
            }

            const sortedResults = gamesAndRelevance.sort((a, b) => {
                if (a[0] === b[0]) {
                    return a[1].Age - b[1].Age;
                }

                return a[0] - b[0];
            });

            const topResults = this.server.config.gameListing.maxResults === "all"
                || this.server.config.gameListing.maxResults === 0
                ? sortedResults
                : sortedResults.slice(0, this.server.config.gameListing.maxResults);

            ctx.status = 200;
            ctx.body = {
                games: topResults.map(([, gameListing]) => gameListing),
                metadata: {
                    allGamesCount: this.server.rooms.size,
                    matchingGamesCount: sortedResults.length,
                }
            };
        });

        router.get("/api/filters", ctx => {
            const removeExtraFilters = this.server.config.gameListing.removeExtraFilters;
            // Valid values for gameListing.removeExtraFilters:
            // - true = Remove all additional game filters
            // - false = Show all additional game filters
            // - Array<string> = List of game filters to remove
            if (typeof removeExtraFilters === "boolean" && removeExtraFilters) {
                ctx.status = 200;
                ctx.body = { filters: [] };
                return;
            }

            const allFilters = Object.values(Filters).filter(x => typeof x === "string");

            if (!removeExtraFilters) {
                ctx.status = 200;
                ctx.body = { filters: allFilters };
                return;
            }

            const remainingFilters = [];
            const removeFilters: Set<string> = new Set(removeExtraFilters);

            for (const filter of allFilters) {
                if (!removeFilters.has(filter)) remainingFilters.push(filter);
            }

            ctx.status = 200;
            ctx.body = {
                filters: remainingFilters,
            };
        });

        router.get("/api/filtertags", ctx => {
            // Build dynamic filter tags from active rooms
            const tags: FilterTagJson[] = [];

            // Map tags
            const mapCounts: Record<string, number> = {};
            const languageCounts: Record<string, number> = {};
            const gameModeCounts: Record<string, number> = {};

            for (const [, room] of this.server.rooms) {
                if (room.privacy === RoomPrivacy.Private &&
                    !this.server.config.gameListing.ignorePrivacy) {
                    continue;
                }

                const mapName = logMaps[room.settings.map] || GameMap[room.settings.map] || "Unknown";
                mapCounts[mapName] = (mapCounts[mapName] || 0) + 1;

                const langName = GameKeyword[room.settings.keywords] || "Unknown";
                languageCounts[langName] = (languageCounts[langName] || 0) + 1;

                const modeName = GameMode[room.settings.gameMode] || "Normal";
                gameModeCounts[modeName] = (gameModeCounts[modeName] || 0) + 1;
            }

            // Build map filter tags
            for (const [name, count] of Object.entries(mapCounts)) {
                tags.push({ Name: name, DisplayName: name, Type: "map", Count: count });
            }

            // Build language filter tags
            for (const [name, count] of Object.entries(languageCounts)) {
                tags.push({ Name: name, DisplayName: name, Type: "language", Count: count });
            }

            // Build game mode filter tags
            for (const [name, count] of Object.entries(gameModeCounts)) {
                tags.push({ Name: name, DisplayName: name, Type: "gameMode", Count: count });
            }

            // Include configured static filter tags from server config
            const configuredTags = this.server.config.gameListing.filterTags;
            if (configuredTags && Array.isArray(configuredTags)) {
                for (const tag of configuredTags) {
                    tags.push({
                        Name: tag.name,
                        DisplayName: tag.displayName,
                        Type: "tag",
                        Count: 0,
                    });
                }
            } else {
                // Default tags if none configured
                tags.push(
                    { Name: "Beginner", DisplayName: "Beginner Friendly", Type: "tag", Count: 0 },
                    { Name: "Expert", DisplayName: "Expert", Type: "tag", Count: 0 },
                    { Name: "Casual", DisplayName: "Casual", Type: "tag", Count: 0 },
                    { Name: "Serious", DisplayName: "Serious", Type: "tag", Count: 0 },
                );
            }

            ctx.status = 200;
            ctx.body = tags;
        });

        router.get("/api/games/:game_id", ctx => {
            const gameCode = parseInt(ctx.params.game_id);
            const foundRoom = this.server.rooms.get(gameCode);
            if (!foundRoom) {
                this.logger.info("Client failed to find room, game not found: %s", new RoomCode(gameCode));
                ctx.status = 404;
                ctx.body = {
                    Errors: [{ Reason: DisconnectReason[DisconnectReason.GameNotFound] }],
                    Game: null,
                    Region: StringName.NoTranslation,
                    UntranslatedRegion: this.server.config.clusterName,
                } as GameFoundByCodeJson;
                return;
            }

            this.logger.info("Client found room: %s", foundRoom);

            // Build enhanced player listing
            const players: PlayerListingJson[] = [];
            for (const [, player] of foundRoom.players) {
                const playerInfo = player.getPlayerInfo();
                const connection = foundRoom.connections.get(player.clientId);
                players.push({
                    ClientId: player.clientId,
                    Username: player.username || "Unknown",
                    Color: playerInfo?.currentOutfit?.color ?? -1,
                    HatId: playerInfo?.currentOutfit?.hatId ?? "",
                    SkinId: playerInfo?.currentOutfit?.skinId ?? "",
                    VisorId: playerInfo?.currentOutfit?.visorId ?? "",
                    IsHost: foundRoom.authorityId === player.clientId ||
                            (connection ? foundRoom.actingHosts.has(connection) : false),
                    IsDead: playerInfo?.isDead ?? false,
                });
            }

            const gameListing = this.getGameListing(ctx.socket.remoteAddress || "", foundRoom);
            const gameInfo: GameInfoJson = {
                ...gameListing,
                Players: players,
                GameState: GameState[foundRoom.gameState] || "Unknown",
                GameMode: GameMode[foundRoom.settings.gameMode] || "Normal",
                Privacy: foundRoom.privacy === RoomPrivacy.Public ? "Public" : "Private",
            };

            ctx.status = 200;
            ctx.body = {
                Errors: null,
                Game: gameInfo,
                Region: StringName.NoTranslation,
                UntranslatedRegion: this.server.config.clusterName,
            } as GameFoundByCodeJson;
        });

        router.post("/api/games/:game_id/refresh", ctx => {
            if (!this.verifyRequest(ctx)) {
                ctx.status = 401;
                return;
            }

            const gameCode = parseInt(ctx.params.game_id);
            const foundRoom = this.server.rooms.get(gameCode);

            if (!foundRoom) {
                ctx.status = 404;
                ctx.body = {
                    Errors: [{ Reason: DisconnectReason[DisconnectReason.GameNotFound] }]
                };
                return;
            }

            // Refresh the room's filter-related metadata
            // This allows hosts to update their room's visibility tags
            const body = (ctx.request as any).body || {};

            if (typeof body.privacy === "number") {
                foundRoom.privacy = body.privacy === 1
                    ? RoomPrivacy.Public
                    : RoomPrivacy.Private;
            }

            if (typeof body.roomName === "string" && body.roomName.length > 0) {
                foundRoom.setRoomNameOverride(body.roomName);
            }

            this.logger.info("Room %s refreshed filters (privacy=%s)", foundRoom,
                foundRoom.privacy === RoomPrivacy.Public ? "public" : "private");

            ctx.status = 200;
            ctx.body = {
                Success: true,
                Game: this.getGameListing(ctx.socket.remoteAddress || "", foundRoom),
            };
        });

        router.use((req, res) => {
            this.logger.info("Bad request to %s", req.url);
        });

        koaServer.use(router.routes());

        return koaServer;
    }

    listen() {
        if (this.httpServer)
            throw new Error("Http server already running; cannot listen on socket");

        const koaServer = this.createKoaServer();
        this.httpServer = koaServer.listen(this.port);
        this.logger.info("Http server listening on *:%s", this.port);
    }

    destroy() {
        if (!this.httpServer)
            throw new Error("No http server running; cannot destroy matchmaker");

        this.httpServer.close();
        this.httpServer = undefined;
    }

    restart() {
        if (this.httpServer)
            this.destroy();

        const koaServer = this.createKoaServer();
        this.httpServer = koaServer.listen(this.port);
    }
}
