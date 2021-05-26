import {
    CheckNameMessage,
    MessageDirection,
    PacketDecoder,
    Serializable,
    SetNameMessage
} from "@skeldjs/protocol";

import { Networkable, PlayerData } from "@skeldjs/core";

import { Client } from "./Client";
import { MatchmakerNode } from "./MatchmakerNode";
import { Room } from "./Room";
import { fmtClient } from "./util/format-client";

export interface AnticheatValue {
    penalty?: "ban"|"disconnect"|"ignore";
    strikes?: number;
    banDuration?: number;
}

export interface AnticheatConfig {
    banMessage: string;
    maxConnectionsPerIp: number;
    checkSettings: boolean|AnticheatValue;
    checkObjectOwnership: boolean|AnticheatValue;
    hostChecks: boolean|AnticheatValue;
    malformedPackets: boolean|AnticheatValue;
    invalidFlow: boolean|AnticheatValue;
    invalidName: boolean|AnticheatValue;
    massivePackets: boolean|AnticheatValue;
}

export interface AnticheatContext {
    component: Networkable;
    player: PlayerData;
    client: Client;
}

export class Anticheat {
    decoder: PacketDecoder<AnticheatContext>;

    constructor(private server: MatchmakerNode, private room: Room) {
        this.decoder = new PacketDecoder;

        this.decoder.on(SetNameMessage, async (message, direction, { component, player, client }) => {
            if (player.ishost) {
                if (component.ownerid === player.id && message.name !== client.username) {
                    this.server.logger.warn(
                        "%s set their name to %s while they identified as %s.",
                        fmtClient(client), message.name, client.username
                    );
                    if (await client.penalize("invalidName")) {
                        return message.cancel();
                    }
                }
            } else {
                this.server.logger.warn(
                    "%s set their name while they weren't the host.",
                    fmtClient(client)
                );
                if (await client.penalize("hostChecks")) {
                    return message.cancel();
                }
            }
        });

        this.decoder.on(CheckNameMessage, async (message, direction, { client }) => {
            if (message.name !== client.username) {
                this.server.logger.warn(
                    "%s asked the host to set their name to %s while they identified as %s.",
                    fmtClient(client), message.name, client.username
                );
                if (await client.penalize("invalidName")) {
                    return message.cancel();
                }
            }
        });
    }

    async emitDecoded(
        message: Serializable,
        direction: MessageDirection,
        sender: AnticheatContext
    ) {
        await this.emit(message, direction, sender);

        if (!message.children) return;

        for (const child of message.children) {
            await this.emitDecoded(child, direction, sender);
        }
    }

    private async emit(
        message: Serializable,
        direction: MessageDirection,
        sender: AnticheatContext
    ) {
        const classes = this.decoder.types.get(message.type);

        if (classes) {
            const messageClass = classes.get(message.tag);

            if (!messageClass)
                return;

            const listeners = this.decoder.getListeners(messageClass);

            for (const listener of listeners) {
                await listener(message, direction, sender);
            }
        }
    }
}