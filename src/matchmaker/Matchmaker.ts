import chalk from "chalk";
import polka from "polka";
import crypto, { verify } from "crypto";
import { Platform } from "@skeldjs/constant";
import { json } from "../util/jsonBodyParser";
import { Worker } from "../worker";
import { VersionInfo } from "@skeldjs/util";
import { Logger } from "../logger";

export interface GameListingJson {
    IP: number;
    Port: number;
    GameId: number;
    HostName: string;
    PlayerCount: number;
    Age: number;
    MapId: number;
    NumImpostors: number;
    MaxPlayers: number;
    Platform: number;
    HostPlatformName: string;
    Language: number;
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

    httpServer?: polka.Polka;
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

    verifyRequest(req: any) {
        const authorization = req.headers.authorization;

        if (!authorization)
            return false;

        const [ tokenType, token ] = authorization.split(" ");

        if (!tokenType || !token || tokenType !== "Bearer")
            return false;

        const verifyToken = this.verifyMatchmakerToken(token);
        if (verifyToken instanceof Error) {
            if (this.worker.config.logging.hideSensitiveInfo) {
                this.logger.warn("Invalid request to %s: %s",
                    req.originalUrl, verifyToken.message);
            } else {
                const address = req.socket.address();

                if ("port" in address) {
                    this.logger.warn("Invalid request to %s from %s:%s: %s",
                        req.originalUrl, address.address, address.port, verifyToken.message);
                } else {
                    this.logger.warn("Invalid request to %s: %s",
                        req.originalUrl, verifyToken.message);
                }
            }
            return false;
        }

        return true;
    }

    protected createHttpServer() {
        const httpServer = polka();

        httpServer.use(json() as any);
        httpServer.use((req, res, next) => {
            res.status = res.sendStatus = x => (res.statusCode = x, res);
            res.json = (body: any) => (res.setHeader("Content-Type", "application/json"), res.end(JSON.stringify(body)), res);
            next();
        });

        for (const [ , loadedPlugin ] of this.worker.loadedPlugins) {
            for (let i = 0; i < loadedPlugin.loadedMatchmakerEndpoints.length; i++) {
                const { method, route, body } = loadedPlugin.loadedMatchmakerEndpoints[i];

                httpServer[method](route, body.bind(loadedPlugin.pluginInstance) as any);
            }
        }

        httpServer.post("/api/user", (req, res) => {
            if (req.headers["content-type"] !== "application/json") {
                this.worker.logger.warn("Client failed to get a matchmaker token: Invalid Content-Type header (%s)", req.headers["content-type"]);
                return res.status(400).end("");
            }

            if (typeof req.body.Puid !== "string") {
                this.worker.logger.warn("Client failed to get a matchmaker token: No 'Puid' provided in body");
                return res.status(400).end("");
            }

            if (typeof req.body.Username !== "string") {
                this.worker.logger.warn("Client failed to get a matchmaker token: No 'Username' provided in body");
                return res.status(400).end("");
            }

            if (typeof req.body.ClientVersion !== "number") {
                this.worker.logger.warn("Client %s failed to get a matchmaker token: No 'ClientVersion' provided in body", chalk.blue(req.body.Username));
                return res.status(400).end("");
            }

            if (!this.worker.isVersionAccepted(req.body.ClientVersion)) {
                this.worker.logger.warn("Client %s failed to get a matchmaker token: Outdated or invalid client version: %s %s",
                    chalk.blue(req.body.Username), VersionInfo.from(req.body.ClientVersion).toString(), chalk.grey("(" + req.body.ClientVersion + ")"));
                return res.status(400).end("");
            }


            if (typeof req.body.Language !== "number") {
                this.worker.logger.warn("Client failed to get a matchmaker token: No 'Language' provided in body");
                return res.status(400).end("");
            }

            // todo: record matchmaking tokens used
            if (this.worker.config.logging.hideSensitiveInfo) {
                this.worker.logger.info("Client %s got a matchmaker token", chalk.blue(req.body.Username));
            } else {
                this.worker.logger.info("Client %s (%s) got a matchmaker token", chalk.blue(req.body.Username), chalk.grey(req.body.Puid));
            }

            const mmToken = this.generateMatchmakerToken(req.body.Puid, req.body.ClientVersion);
            res.status(200).end(mmToken);
        });

        httpServer.post("/api/games", (req, res) => {
            if (!this.verifyRequest(req))
                return res.status(401).end("");

            if (!req.query.gameId) {
                this.worker.logger.warn("Client failed to find host for room: No 'gameId' provided in query parameters");
                return res.status(400).end("");
            }

            const listingIp = req.socket.remoteAddress !== "127.0.0.1" ? this.worker.config.socket.ip : "127.0.0.1";

            res.status(200).json({
                Ip: Buffer.from(listingIp.split(".").map(x => parseInt(x))).readUInt32LE(0),
                Port: this.getRandomWorkerPort()
            });
        });

        httpServer.put("/api/games", (req, res) => {
            if (!this.verifyRequest(req))
                return res.status(401).end("");

            const listingIp = req.socket.remoteAddress !== "127.0.0.1" ? this.worker.config.socket.ip : "127.0.0.1";

            res.status(200).json({
                Ip: Buffer.from(listingIp.split(".").map(x => parseInt(x))).readUInt32LE(0),
                Port: this.getRandomWorkerPort()
            });
        });

        httpServer.get("/api/games", (req, res) => {
            if (!this.verifyRequest(req))
                return res.status(401).end("");

            if (!req.query.mapId) {
                this.worker.logger.warn("Client failed to find host for room: No 'gameId' provided in query parameters");
                return res.status(400).end("");
            }

            if (!req.query.lang) {
                this.worker.logger.warn("Client failed to find host for room: No 'lang' provided in query parameters");
                return res.status(400).end("");
            }

            if (!req.query.quickChat) {
                this.worker.logger.warn("Client failed to find host for room: No 'quickChat' provided in query parameters");
                return res.status(400).end("");
            }

            if (!req.query.platformFlags) {
                this.worker.logger.warn("Client failed to find host for room: No 'platformFlags' provided in query parameters");
                return res.status(400).end("");
            }

            if (!req.query.numImpostors) {
                this.worker.logger.warn("Client failed to find host for room: No 'numImpostors' provided in query parameters");
                return res.status(400).end("");
            }

            const listingIp = req.socket.remoteAddress === "127.0.0.1" || req.socket.remoteAddress === "::ffff:127.0.0.1"
                ? "127.0.0.1"
                : this.worker.config.socket.ip;

            const ignoreSearchTerms = Array.isArray(this.worker.config.gameListing.ignoreSearchTerms)
                ? new Set(this.worker.config.gameListing.ignoreSearchTerms)
                : this.worker.config.gameListing.ignoreSearchTerms;

            const gamesAndRelevance: [ number, GameListingJson ][] = [];
            for (const [ gameCode, room ] of this.worker.rooms) {
                if (gameCode === 0x20 /* local game */) {
                    continue;
                }

                if (!this.worker.config.gameListing.ignorePrivacy && room.privacy === "private")
                    continue;

                const roomAge = Math.floor((Date.now() - room.createdAt) / 1000);
                const gameListing: GameListingJson = {
                    IP: Buffer.from(listingIp.split(".").map(x => parseInt(x))).readUInt32LE(0),
                    Port: this.getRandomWorkerPort(),
                    GameId: room.code,
                    HostName: room.roomName,
                    PlayerCount: room.players.size,
                    Age: roomAge,
                    MapId: room.settings.map,
                    NumImpostors: room.settings.numImpostors,
                    MaxPlayers: room.settings.maxPlayers,
                    Platform: room.host?.platform.platformTag || Platform.Unknown,
                    HostPlatformName: room.host?.platform.platformName || "UNKNOWN",
                    Language: room.settings.keywords
                };

                if (ignoreSearchTerms === true) {
                    gamesAndRelevance.push([ 0, gameListing ]);
                    continue;
                }

                const relevancy = this.worker.getRoomRelevancy(
                    room,
                    parseInt(req.query.numImpostors as string),
                    parseInt(req.query.lang as string),
                    parseInt(req.query.mapId as string),
                    req.query.quickChat as string,
                    this.worker.config.gameListing.requirePefectMatches,
                    ignoreSearchTerms
                );

                if (relevancy === 0 && this.worker.config.gameListing.requirePefectMatches)
                    continue;

                gamesAndRelevance.push([
                    relevancy,
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

            res.status(200).json(topResults.map(([ , gameListing ]) => gameListing));
        });

        return httpServer;
    }

    listen() {
        if (this.httpServer)
            throw new Error("Http server already running; cannot listen on socket");

        this.httpServer = this.createHttpServer();
        this.httpServer.listen(this.port);
        this.worker.logger.info("HTTP matchmaker on *:%s", this.port);
    }

    destroy() {
        if (!this.httpServer || !this.httpServer.server)
            throw new Error("No http server running; cannot destroy matchmaker");

        this.httpServer.server.close();
        this.httpServer = undefined;
    }

    restart() {
        if (this.httpServer)
            this.destroy();

        this.httpServer = this.createHttpServer();
        this.httpServer.listen(this.port);
    }
}
