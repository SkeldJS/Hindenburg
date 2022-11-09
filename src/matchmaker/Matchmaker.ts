import chalk from "chalk";
import polka from "polka";
import { GameKeyword, Platform } from "@skeldjs/constant";
import { json } from "../util/jsonBodyParser";
import { Worker } from "../worker";
import { VersionInfo } from "@skeldjs/util";

// This mmtoken will be invalid instantly because:
// The ClientVersion is set to 0 and the expires at is set to Jan 1st 1970
const mmTokenPayload = {
    Content: {
        Puid: "",
        ClientVersion: 0,
        ExpiresAt: "1970-01-01T00:00:00.000Z"
    },
    Hash: ""
};
const mmToken = Buffer.from(JSON.stringify(mmTokenPayload), "utf8").toString("base64");

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

export class Matchmaker {
    httpServer?: polka.Polka;

    constructor(protected readonly worker: Worker) {}

    get port() {
        return typeof this.worker.config.matchmaker === "boolean" ? 80 : this.worker.config.matchmaker.port;
    }

    getRandomWorkerPort() {
        const allPorts = [this.worker.config.socket.port, ...this.worker.config.socket.additionalPorts];
        return allPorts[~~(Math.random() * allPorts.length)];
    }

    protected createHttpServer() {
        const httpServer = polka();

        httpServer.use(json() as any);
        httpServer.use((req, res, next) => {
            res.status = res.sendStatus = x => (res.statusCode = x, res);
            res.json = (body: any) => (res.setHeader("Content-Type", "application/json"), res.end(JSON.stringify(body)), res);
            next();
        });

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

            res.status(200).end(mmToken);
        });

        httpServer.post("/api/games", (req, res) => {
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
            const listingIp = req.socket.remoteAddress !== "127.0.0.1" ? this.worker.config.socket.ip : "127.0.0.1";

            res.status(200).json({
                Ip: Buffer.from(listingIp.split(".").map(x => parseInt(x))).readUInt32LE(0),
                Port: this.getRandomWorkerPort()
            });
        });

        httpServer.get("/api/games", (req, res) => {
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

            const returnList: GameListingJson[] = [];
            const listingIp = req.socket.remoteAddress === "127.0.0.1" || req.socket.remoteAddress === "::ffff:127.0.0.1"
                ? "127.0.0.1"
                : this.worker.config.socket.ip;

            for (const [ gameCode, room ] of this.worker.rooms) {
                if (gameCode === 0x20 /* local game */) {
                    continue;
                }

                if (room.privacy === "private")
                    continue;

                const roomAge = Math.floor((Date.now() - room.createdAt) / 1000);
                const numImpostors = parseInt(req.query.numImpostors as string);

                if (
                    room.settings.keywords === (GameKeyword[req.query.lang as unknown as number] as unknown as number) &&
                    (parseInt(req.query.mapId as string) & (1 << room.settings.map)) !== 0 &&
                    (
                        room.settings.numImpostors === numImpostors ||
                        numImpostors === 0
                    )
                ) {
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

                    returnList.push(gameListing);

                    if (returnList.length >= 10)
                        break;
                }
            }

            res.status(200).json(returnList);
        });

        for (const [ , loadedPlugin ] of this.worker.loadedPlugins) {
            for (let i = 0; i < loadedPlugin.loadedMatchmakerEndpoints.length; i++) {
                const { method, route, body } = loadedPlugin.loadedMatchmakerEndpoints[i];

                httpServer[method](route, body.bind(loadedPlugin.pluginInstance) as any);
            }
        }

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
