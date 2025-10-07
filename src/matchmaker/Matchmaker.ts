import chalk from "chalk";
import Koa from "koa";
import http from "http";
import KoaRouter from "@koa/router";
import { GameCode, HazelWriter, VersionInfo } from "@skeldjs/util";
import koaBody from "koa-body";
import crypto from "crypto";
import { DisconnectReason, Platform, StringNames } from "@skeldjs/constant";

import { Room, Worker } from "../worker";
import { Logger } from "../logger";

export interface GameListingJson {
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
    Options: string;
}

export interface ErrorJson {
    Reason: keyof typeof DisconnectReason;
}

export interface GameFoundByCodeJson {
    Errors: ErrorJson[] | null;
    Game: GameListingJson | null;
    Region: number;
    UntranslatedRegion: string;
}

export interface MatchmakerTokenPayload {
    Content: {
        Puid: string;
        ClientVersion: number;
        ExpiresAt: string;
    };
    Hash: string;
}

function safeJsonParse(jsonString: string) {
    try {
        return JSON.parse(jsonString);
    } catch (e) {
        return undefined;
    }
}

export class Matchmaker {
    logger: Logger;

    httpServer?: http.Server;
    privateKey: Buffer;

    constructor(protected readonly worker: Worker) {
        this.logger = new Logger("Matchmaker", this.worker.vorpal);
        this.privateKey = crypto.randomBytes(128);
    }

    get port() {
        return typeof this.worker.config.matchmaker === "boolean" ? 80 : this.worker.config.matchmaker.port;
    }

    getRandomWorkerPort() {
        const allPorts = [this.worker.config.socket.port, ...this.worker.config.socket.additionalPorts];
        return allPorts[~~(Math.random() * allPorts.length)];
    }

    generateMatchmakerToken(puid: string, clientVersion: number) {
        const payloadContent = {
            Puid: puid,
            ClientVersion: clientVersion,
            ExpiresAt: new Date().toISOString()
        };

        const payloadString = JSON.stringify(payloadContent);
        const computedHash = crypto.createHmac("sha256", this.privateKey).update(payloadString).digest();

        const payload = {
            Content: payloadContent,
            Hash: computedHash.toString("base64")
        };

        return Buffer.from(JSON.stringify(payload), "utf8").toString("base64");
    }

    verifyMatchmakerToken(token: string) {
        const decodedToken = Buffer.from(token, "base64").toString("utf8");
        const json = safeJsonParse(decodedToken) as MatchmakerTokenPayload;
        
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

    verifyRequest(ctx: Koa.Context) {
        const authorization = ctx.headers.authorization;

        if (!authorization)
            return false;

        const [tokenType, token] = authorization.split(" ");

        if (!tokenType || !token || tokenType !== "Bearer")
            return false;

        const verifyToken = this.verifyMatchmakerToken(token);
        if (verifyToken instanceof Error) {
            if (this.worker.config.logging.hideSensitiveInfo) {
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
        const listingIp = fromAddress === "127.0.0.1" || fromAddress === "::ffff:127.0.0.1"
            ? "127.0.0.1"
            : this.worker.config.socket.ip;

        const settingsWriter = HazelWriter.alloc(256);
        settingsWriter.write(room.settings, false, 10);

        const roomAge = Math.floor((Date.now() - room.createdAt) / 1000);
        const gameListing: GameListingJson = {
            IP: Buffer.from(listingIp.split(".").map(x => parseInt(x))).readUInt32LE(0),
            Port: this.getRandomWorkerPort(),
            GameId: room.code,
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
            Options: settingsWriter.toString("base64"),
        };
        return gameListing;
    }

    protected createKoaServer() {
        const koaServer = new Koa;
        koaServer.use(koaBody());

        const router = new KoaRouter;
        for (const [, loadedPlugin] of this.worker.loadedPlugins) {
            for (let i = 0; i < loadedPlugin.loadedMatchmakerEndpoints.length; i++) {
                const { method, route, body } = loadedPlugin.loadedMatchmakerEndpoints[i];

                router[method](route, body.bind(loadedPlugin.pluginInstance) as any);
            }
        }

        router.post("/api/user", async (ctx) => {
            if (ctx.req.headers["content-type"] !== "application/json") {
                this.logger.warn("Client failed to get a matchmaker token: Invalid Content-Type header (%s)", ctx.headers["content-type"]);
                ctx.status = 400;
                return;
            }

            if (typeof ctx.request.body.Puid !== "string") {
                this.logger.warn("Client failed to get a matchmaker token: No 'Puid' provided in body");
                ctx.status = 400;
                return;
            }

            if (typeof ctx.request.body.Username !== "string") {
                this.logger.warn("Client failed to get a matchmaker token: No 'Username' provided in body");
                ctx.status = 400;
                return;
            }

            if (typeof ctx.request.body.ClientVersion !== "number") {
                this.logger.warn("Client %s failed to get a matchmaker token: No 'ClientVersion' provided in body", chalk.blue(ctx.request.body.Username));
                ctx.status = 400;
                ctx.body = "";
                return;
            }

            if (!this.worker.isVersionAccepted(ctx.request.body.ClientVersion)) {
                this.logger.warn("Client %s failed to get a matchmaker token: Outdated or invalid client version: %s %s",
                    chalk.blue(ctx.request.body.Username), VersionInfo.from(ctx.request.body.ClientVersion).toString(), chalk.grey("(" + ctx.request.body.ClientVersion + ")"));
                ctx.status = 400;
                return;
            }

            if (typeof ctx.request.body.Language !== "number") {
                this.logger.warn("Client failed to get a matchmaker token: No 'Language' provided in body");
                ctx.status = 400;
                return;
            }

            // todo: record matchmaking tokens used
            if (this.worker.config.logging.hideSensitiveInfo) {
                this.logger.info("Client %s got a matchmaker token", chalk.blue(ctx.request.body.Username));
            } else {
                this.logger.info("Client %s (%s) got a matchmaker token", chalk.blue(ctx.request.body.Username), chalk.grey(ctx.request.body.Puid));
            }

            const mmToken = this.generateMatchmakerToken(ctx.request.body.Puid, ctx.request.body.ClientVersion);
            ctx.status = 200;
            ctx.body = mmToken;
        });

        router.post("/api/games", ctx => {
            if (!this.verifyRequest(ctx)) {
                ctx.status = 401;
                return;
            }

            if (!ctx.query.gameId) {
                this.logger.warn("Client failed to find host for room: No 'gameId' provided in query parameters");
                ctx.status = 400;
                return;
            }

            const listingIp = ctx.socket.remoteAddress !== "127.0.0.1" ? this.worker.config.socket.ip : "127.0.0.1";

            ctx.status = 200;
            ctx.body = {
                Ip: Buffer.from(listingIp.split(".").map(x => parseInt(x))).readUInt32LE(0),
                Port: this.getRandomWorkerPort()
            };
        });

        router.put("/api/games", ctx => {
            if (!this.verifyRequest(ctx)) {
                ctx.status = 401;
                return;
            }

            const listingIp = ctx.socket.remoteAddress !== "127.0.0.1" ? this.worker.config.socket.ip : "127.0.0.1";

            ctx.status = 200;
            ctx.body = {
                Ip: Buffer.from(listingIp.split(".").map(x => parseInt(x))).readUInt32LE(0),
                Port: this.getRandomWorkerPort()
            };
        });

        router.get("/api/games/filtered", ctx => {
            if (!this.verifyRequest(ctx)) {
                ctx.status = 401;
                return;
            }

            // if (!ctx.query.mapId) {
            //     this.logger.warn("Client failed to find games: No 'mapId' provided in query parameters");
            //     ctx.status = 400;
            //     return;
            // }

            // if (!ctx.query.lang) {
            //     this.logger.warn("Client failed to find games: No 'lang' provided in query parameters");
            //     ctx.status = 400;
            //     return;
            // }

            // if (!ctx.query.quickChat) {
            //     this.logger.warn("Client failed to find games: No 'quickChat' provided in query parameters");
            //     ctx.status = 400;
            //     return;
            // }

            // if (!ctx.query.platformFlags) {
            //     this.logger.warn("Client failed to find games: No 'platformFlags' provided in query parameters");
            //     ctx.status = 400;
            //     return;
            // }

            // if (!ctx.query.numImpostors) {
            //     this.logger.warn("Client failed to find games: No 'numImpostors' provided in query parameters");
            //     ctx.status = 400;
            //     return;
            // }

            // TODO: actually use filter. seems complex in latest among us

            const ignoreSearchTerms = Array.isArray(this.worker.config.gameListing.ignoreSearchTerms)
                ? new Set(this.worker.config.gameListing.ignoreSearchTerms)
                : this.worker.config.gameListing.ignoreSearchTerms;

            const gamesAndRelevance: [number, GameListingJson][] = [];
            for (const [gameCode, room] of this.worker.rooms) {
                if (gameCode === 0x20 /* local game */) {
                    continue;
                }

                if (!this.worker.config.gameListing.ignorePrivacy && room.privacy === "private")
                    continue;


                const gameListing = this.getGameListing(ctx.socket.remoteAddress || "", room);

                if (ignoreSearchTerms === true) {
                    gamesAndRelevance.push([0, gameListing]);
                    continue;
                }

                // const relevancy = this.worker.getRoomRelevancy(
                //     room,
                //     parseInt(ctx.query.numImpostors as string),
                //     parseInt(ctx.query.lang as string),
                //     parseInt(ctx.query.mapId as string),
                //     ctx.query.quickChat as string,
                //     this.worker.config.gameListing.requirePefectMatches,
                //     ignoreSearchTerms
                // );

                // if (relevancy === 0 && this.worker.config.gameListing.requirePefectMatches)
                //     continue;

                // TODO: actually use filter. seems complex in latest among us

                gamesAndRelevance.push([
                    0,
                    gameListing
                ]);
            }

            const sortedResults = gamesAndRelevance.sort((a, b) => {
                if (a[0] === b[0]) {
                    return a[1].Age - b[1].Age;
                }

                return b[0] - a[0];
            });

            const topResults = this.worker.config.gameListing.maxResults === "all"
                || this.worker.config.gameListing.maxResults === 0
                ? sortedResults
                : sortedResults.slice(0, this.worker.config.gameListing.maxResults);

            ctx.status = 200;
            ctx.body = {
                games: topResults.map(([, gameListing]) => gameListing),
                metadata: {
                    allGamesCount: this.worker.rooms.size,
                    matchingGamesCount: sortedResults.length,
                }
            };
        });

        router.get("/api/games/:game_id", ctx => {
            const gameCode = parseInt(ctx.params.game_id);
            const foundRoom = this.worker.rooms.get(gameCode);
            if (!foundRoom) {
                this.logger.info("Client failed to find room, game not found: %s", GameCode.convertIntToString(gameCode));
                ctx.status = 404;
                ctx.body = {
                    Errors: [{ Reason: DisconnectReason[DisconnectReason.GameNotFound] }],
                    Game: null,
                    Region: StringNames.NoTranslation,
                    UntranslatedRegion: this.worker.config.clusterName,
                } as GameFoundByCodeJson;
                return;
            }

            this.logger.info("Client found room: %s", foundRoom);

            ctx.status = 200;
            ctx.body = {
                Errors: null,
                Game: this.getGameListing(ctx.socket.remoteAddress || "", foundRoom),
                Region: StringNames.NoTranslation,
                UntranslatedRegion: this.worker.config.clusterName,
            } as GameFoundByCodeJson;
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
        this.logger.info("HTTP matchmaker on *:%s", this.port);
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
