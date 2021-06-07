import {
    CheckColorMessage,
    CheckNameMessage,
    PacketDecoder,
    SetColorMessage,
    SetNameMessage
} from "@skeldjs/protocol";

import { Color, Networkable, PlayerData } from "@skeldjs/core";

import { Client } from "./Client";
import { MatchmakerNode } from "./MatchmakerNode";
import { Room } from "./Room";
import { fmtPlayer } from "./util";

export interface AnticheatValueConfig {
    penalty?: "ban"|"disconnect"|"ignore";
    strikes?: number;
    banDuration?: number;
}

export type AnticheatValue = boolean|AnticheatValueConfig;

export interface AnticheatConfig {
    banMessage: string;
    maxConnectionsPerIp: number;
    checkSettings: AnticheatValue;
    checkObjectOwnership: AnticheatValue;
    hostChecks: AnticheatValue;
    malformedPackets: AnticheatValue;
    invalidFlow: AnticheatValue;
    invalidName: AnticheatValue & {
        changedTwice?: boolean;
        wrongName?: boolean;
        badHostChecks?: boolean;
        invalidChars?: boolean|{
            regex?: string;
        };
        maxNameLength?: number;
    };
    invalidColor: AnticheatValue & {
        badHostChecks?: boolean;
        invalidColor?: boolean;
    };
    massivePackets: AnticheatValue;
}

export interface AnticheatContext {
    component: Networkable;
    player: PlayerData;
    client: Client;
}

export class Anticheat {
    config: AnticheatConfig;
    decoder: PacketDecoder<AnticheatContext>;

    constructor(private server: MatchmakerNode, private room: Room) {
        this.decoder = new PacketDecoder;

        this.config = server.config.anticheat;
        
        const invalidCharsRegexp = this.config.invalidName?.invalidChars
            ? new RegExp((this.config.invalidName.invalidChars as { regex: string }).regex || /[^a-zA-Z0-9]/)
            : undefined;

        this.decoder.on(SetNameMessage, async (message, direction, { component, player, client }) => {
            if (player.ishost) {
                if (room.gamedata) {
                    for (const [ , playerInfo ] of room.gamedata.players) {
                        if (playerInfo.name === message.name) {
                            this.server.logger.warn(
                                "%s set a player's name to a name already taken by %s.",
                                fmtPlayer(player), fmtPlayer(playerInfo.player)
                            );
                            if (await client.penalize("invalidName", "badHostChecks")) {
                                return message.cancel();
                            }
                        }
                    }
                }
                if (component.ownerid === player.id) {
                    if (player.info?.name) {
                        this.server.logger.warn(
                            "%s set their name while they already had a name.",
                            fmtPlayer(player)
                        );
                        if (await client.penalize("invalidName", "changedTwice")) {
                            return message.cancel();
                        }
                    }
                    if (message.name !== client.username) {
                        this.server.logger.warn(
                            "%s set their name to %s while they identified as %s.",
                            fmtPlayer(player), message.name, client.username
                        );
                        if (await client.penalize("invalidName", "wrongName")) {
                            return message.cancel();
                        }
                    }
                    if (this.config.invalidName || this.config.invalidName.invalidChars) {
                        if (invalidCharsRegexp?.test(message.name)) {
                            this.server.logger.warn(
                                "%s set their name to %s, which has invalid characters.",
                                fmtPlayer(player), message.name
                            );
                            if (await client.penalize("invalidName", "invalidChars")) {
                                return message.cancel();
                            }
                        }
                    }
                    const maxNameLength = this.config.invalidName.maxNameLength ?? 10;
                    if (maxNameLength > 0 && message.name.length > maxNameLength) {
                        this.server.logger.warn(
                            "%s set their name to %s, longer than the maxNameLength of %s",
                            fmtPlayer(player), message.name, maxNameLength
                        );
                        if (await client.penalize("invalidName", "maxNameLength")) {
                            return message.cancel();
                        }
                    }
                }
            } else {
                this.server.logger.warn(
                    "%s set their name while they weren't the host.",
                    fmtPlayer(player)
                );
                if (await client.penalize("hostChecks")) {
                    return message.cancel();
                }
            }
        });

        this.decoder.on(CheckNameMessage, async (message, direction, { player, client }) => {
            if (player.info?.name) {
                this.server.logger.warn(
                    "%s asked the host to set their name while they already had a name.",
                    fmtPlayer(player)
                );
                if (await client.penalize("invalidName", "changedTwice")) {
                    return message.cancel();
                }
            }
            if (message.name !== client.username) {
                this.server.logger.warn(
                    "%s asked the host to set their name to %s while they identified as %s.",
                    fmtPlayer(player), message.name, client.username
                );
                if (await client.penalize("invalidName", "wrongName")) {
                    return message.cancel();
                }
            }
            if (this.config.invalidName || this.config.invalidName.invalidChars) {
                if (invalidCharsRegexp?.test(message.name)) {
                    this.server.logger.warn(
                        "%s asked the host to set their name to %s, which has invalid characters.",
                        fmtPlayer(player), message.name
                    );
                    if (await client.penalize("invalidName", "invalidChars")) {
                        return message.cancel();
                    }
                }
            }
            const maxNameLength = this.config.invalidName.maxNameLength ?? 10;
            if (maxNameLength > 0 && message.name.length > maxNameLength) {
                this.server.logger.warn(
                    "%s asked the host to set their name to %s, longer than the maximum name length of %s.",
                    fmtPlayer(player), message.name, maxNameLength
                );
                if (await client.penalize("invalidName", "maxNameLength")) {
                    return message.cancel();
                }
            }
        });

        this.decoder.on(SetColorMessage, async (message, direction, { component, player, client }) => {
            if (player.ishost) {
                if (component.ownerid === player.id && !(message.color in Color)) {
                    this.server.logger.warn(
                        "%s set their color to an invalid color (idx = %s).",
                        fmtPlayer(player), message.color
                    );
                    if (await client.penalize("invalidColor", "invalidColor")) {
                        return message.cancel();
                    }
                } else if (room.gamedata) {
                    for (const [ , playerInfo ] of room.gamedata.players) {
                        if (playerInfo.color === message.color) {
                            this.server.logger.warn(
                                "%s set a player's color to a color already in use by %s.",
                                fmtPlayer(player), fmtPlayer(playerInfo.player)
                            );
                            if (await client.penalize("invalidColor", "badHostChecks")) {
                                return message.cancel();
                            }
                        }
                    }
                }
            } else {
                this.server.logger.warn(
                    "%s set their color while they weren't the host.",
                    fmtPlayer(player)
                );
                if (await client.penalize("hostChecks")) {
                    return message.cancel();
                }
            }
        });

        this.decoder.on(CheckColorMessage, async (message, direction, { player, client }) => {
            if (!(message.color in Color)) {
                this.server.logger.warn(
                    "%s asked the host to set their color to an invalid color (idx = %s).",
                    fmtPlayer(player), message.color
                );
                if (await client.penalize("invalidColor", "invalidColor")) {
                    return message.cancel();
                }
            }
        });
    }
}