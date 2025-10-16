import chalk from "chalk";
import Koa from "koa";
import koaBody from "koa-body";
import http from "http";
import crypto from "crypto";

import KoaRouter from "@koa/router";
import { HazelWriter } from "@skeldjs/hazel";
import { RoomCode, Version } from "@skeldjs/client";
import { DisconnectReason, Filters, GameKeyword, GameMap, GameMode, Platform, QuickChatMode, StringNames } from "@skeldjs/constant";

import { WaterwayServer } from "./WaterwayServer";
import { Room, RoomPrivacy } from "./Room";
import { Logger } from "./Logger";

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

export class Matchmaker {
    logger: Logger;

    httpServer?: http.Server;
    privateKey: Buffer;

    constructor(protected readonly server: WaterwayServer) {
        this.logger = new Logger(chalk.redBright("Http"), this.server.vorpal);
        this.privateKey = crypto.randomBytes(128);
    }

    get port() {
        return typeof this.server.config.matchmaker === "boolean" ? 80 : this.server.config.matchmaker.port;
    }

    getRandomWorkerPort() {
        const allPorts = [this.server.config.socket.port, ...this.server.config.socket.additionalPorts];
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
        const listingIp = fromAddress === "127.0.0.1" || fromAddress === "::ffff:127.0.0.1"
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

        router.post("/api/user", async (ctx) => {
            const body = (ctx.request as any).body;
            if (ctx.req.headers["content-type"] !== "application/json") {
                this.logger.warn("Client failed to get a matchmaker token: Invalid Content-Type header (%s)", ctx.headers["content-type"]);
                ctx.status = 400;
                return;
            }

            if (typeof body.Puid !== "string") {
                this.logger.warn("Client failed to get a matchmaker token: No 'Puid' provided in body");
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

            // todo: record matchmaking tokens used
            if (this.server.config.logging.hideSensitiveInfo) {
                this.logger.info("Client %s got a matchmaker token", chalk.blue(body.Username));
            } else {
                this.logger.info("Client %s (%s) got a matchmaker token", chalk.blue(body.Username), chalk.grey(body.Puid));
            }

            const mmToken = this.generateMatchmakerToken(body.Puid, body.ClientVersion);
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

            const listingIp = ctx.socket.remoteAddress !== "127.0.0.1" ? this.server.config.socket.ip : "127.0.0.1";

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

            const listingIp = ctx.socket.remoteAddress !== "127.0.0.1" ? this.server.config.socket.ip : "127.0.0.1";

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
            // TODO: when does this get called?
            ctx.status = 200;
            ctx.body = [];
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
                    Region: StringNames.NoTranslation,
                    UntranslatedRegion: this.server.config.clusterName,
                } as GameFoundByCodeJson;
                return;
            }

            this.logger.info("Client found room: %s", foundRoom);

            ctx.status = 200;
            ctx.body = {
                Errors: null,
                Game: this.getGameListing(ctx.socket.remoteAddress || "", foundRoom),
                Region: StringNames.NoTranslation,
                UntranslatedRegion: this.server.config.clusterName,
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
