import chalk from "chalk";
import polka from "polka";
import { GameKeyword, Platform } from "@skeldjs/constant";
import { json } from "../util/jsonBodyParser";
import { Logger } from "../logger";
import { Worker } from "../worker";

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
}

enum AmongUsLanguage {
    All,
    Other,
    SpanisLA,
    Korean,
    Russian,
    Portuguese,
    Arabic,
    Filipino,
    Polish,
    English,
    Japanese,
    SpanishEU,
    Brazilian,
    Dutch,
    French,
    German,
    Italian,
    ChineseSimplified,
    ChineseTraditional,
    Irish
}

export class Matchmaker {
    httpServer?: polka.Polka;
    logger: Logger;

    constructor(protected readonly worker: Worker) {
        this.logger = new Logger("Matchmaker", this.worker.vorpal);
    }

    get port() {
        return typeof this.worker.config.matchmaker === "boolean" ? 80 : this.worker.config.matchmaker.port;
    }

    listen() {
        if (this.httpServer)
            throw new Error("Http server already running; cannot listen on socket");

        this.httpServer = polka();

        this.httpServer.use(json() as any);
        this.httpServer.use((req, res, next) => {
            res.status = res.sendStatus = x => (res.statusCode = x, res);
            res.json = (body: any) => (res.setHeader("Content-Type", "application/json"), res.end(JSON.stringify(body)), res);
            next();
        });

        this.httpServer.post("/api/user", (req, res) => {
            if (req.headers["content-type"] !== "application/json")
                return res.status(400).end("");

            if (typeof req.body.Puid !== "string")
                return res.status(400).end("");

            if (typeof req.body.Username !== "string")
                return res.status(400).end("");

            if (typeof req.body.ClientVersion !== "number" || !this.worker.isVersionAccepted(req.body.ClientVersion))
                return res.status(400).end("");

            if (typeof req.body.Language !== "number")
                return res.status(400).end("");

            // todo: record matchmaking tokens used
            if (this.worker.config.logging.hideSensitiveInfo) {
                this.logger.info("Client %s got a matchmaker token", chalk.blue(req.body.Username));
            } else {
                this.logger.info("Client %s (%s) got a matchmaker token", chalk.blue(req.body.Username), chalk.grey(req.body.Puid));
            }

            res.status(200).end(mmToken);
        });

        this.httpServer.post("/api/games", (req, res) => {
            if (!req.query.gameId)
                return res.status(400).end("");

            const listingIp = req.socket.remoteAddress !== "127.0.0.1" ? this.worker.config.socket.ip : "127.0.0.1";

            res.status(200).json({
                Ip: Buffer.from(listingIp.split(".").map(x => parseInt(x))).readUInt32LE(0),
                Port: this.worker.config.socket.port
            });
        });

        this.httpServer.put("/api/games", (req, res) => {
            const listingIp = req.socket.remoteAddress !== "127.0.0.1" ? this.worker.config.socket.ip : "127.0.0.1";

            res.status(200).json({
                Ip: Buffer.from(listingIp.split(".").map(x => parseInt(x))).readUInt32LE(0),
                Port: this.worker.config.socket.port
            });
        });

        this.httpServer.get("/api/games", (req, res) => {
            if (!req.query.mapId || !req.query.lang || !req.query.quickChat || !req.query.platformFlags || !req.query.numImpostors)
                return res.status(400).end("");

            const returnList: GameListingJson[] = [];
            const listingIp = req.socket.remoteAddress !== "127.0.0.1" ? this.worker.config.socket.ip : "127.0.0.1";

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
                        Port: this.worker.config.socket.port,
                        GameId: room.code,
                        HostName: room.roomName,
                        PlayerCount: room.players.size,
                        Age: roomAge,
                        MapId: room.settings.map,
                        NumImpostors: room.settings.numImpostors,
                        MaxPlayers: room.settings.maxPlayers,
                        Platform: room.host?.platform.platformTag || Platform.Unknown,
                        HostPlatformName: room.host?.platform.platformName || "UNKNOWN"
                    };

                    returnList.push(gameListing);

                    if (returnList.length >= 10)
                        break;
                }
            }

            res.status(200).json(returnList);
        });

        this.httpServer.listen(this.port);
        this.logger.info("Listening on *:%s", this.port);
    }

    destroy() {
        if (!this.httpServer || !this.httpServer.server)
            throw new Error("No http server running; cannot destroy matchmaker");

        this.httpServer.server.close();
    }
}
