import { PlayerData } from "@skeldjs/core";
import { BaseGameDataMessage, DataMessage, GameSettings, MessageDirection, SendChatMessage, SetColorMessage, SetHatMessage, SetNameMessage, SetPetMessage, SetSkinMessage, SnapToMessage, SyncSettingsMessage } from "@skeldjs/protocol";
import { RoomsConfig } from "./interfaces";

import { Worker } from "./Worker";
import { BaseRoom } from "./BaseRoom";
import { Perspective, PerspectiveFilter } from "./Perspective";
import { Connection } from ".";

export class Room extends BaseRoom {
    playerPerspectives: Map<number, Perspective>;
    activePerspectives: Perspective[];

    constructor(
        public readonly worker: Worker,
        public readonly config: RoomsConfig, // todo: handle plugins & enforce settings configs
        settings: GameSettings
    ) {
        super(worker, config, settings);

        this.playerPerspectives = new Map;
        this.activePerspectives = [];
    }

    createPerspective(players: PlayerData|PlayerData[], filters: PerspectiveFilter[]): Perspective {
        if (!Array.isArray(players)) {
            return this.createPerspective([ players ], filters);
        }

        for (let i = 0; i < players.length; i++) {
            if (players[i].room !== this) {
                throw new TypeError("Tried to create a perspective from a player not in this room.");
            }

            if (this.playerPerspectives.has(players[i].id)) {
                throw new TypeError("Player already has active perspective.");
            }
        }

        const perspective = new Perspective(this, players);

        this.activePerspectives.push(perspective);
        for (let i = 0; i < players.length; i++) {
            this.playerPerspectives.set(players[i].id, perspective);
        }

        for (let i = 0; i < filters.length; i++) {
            const filter = filters[i];
            if (filter === PerspectiveFilter.GameDataUpdates) {
                perspective.incomingFilter.on([ SetColorMessage, SetNameMessage, SetSkinMessage, SetPetMessage, SetHatMessage ], message => {
                    message.cancel();
                });
            } else if (filter === PerspectiveFilter.PositionUpdates) {
                perspective.incomingFilter.on([ SnapToMessage ], message => {
                    message.cancel();
                });

                perspective.incomingFilter.on([ DataMessage ], message => {
                    const netobject = perspective.netobjects.get(message.netid);

                    if (netobject?.classname === "CustomNetworkTransform") {
                        message.cancel();
                    }
                });
            } else if (filter === PerspectiveFilter.SettingsUpdates) {
                perspective.incomingFilter.on([ SyncSettingsMessage ], message => {
                    message.cancel();
                });
            } else if (filter === PerspectiveFilter.ChatMessages) {
                perspective.incomingFilter.on([ SendChatMessage ], message => {
                    message.cancel();
                });
            }
        }

        return perspective;
    }

    async broadcastToPerspectives(connection: Connection, messages: BaseGameDataMessage[], reliable: boolean) {
        const player = this.players.get(connection.clientId);

        if (!player)
            return;

        for (let i = 0; i < connection.room!.activePerspectives.length; i++) {
            const activePerspective = connection.room?.activePerspectives[i];

            if (!activePerspective)
                continue;

            // get this player's player object in the perspective in question
            const povPlayer = activePerspective.players.get(player.id);

            if (!povPlayer)
                continue;

            const povNotCanceled = [];
            for (let i = 0; i < messages.length; i++) {
                const child = messages[i];

                (child as any)._canceled = false; // reset the message's canceled state

                // match the message against the perspective's incoming decoder to check whether it should get sent there
                await activePerspective.incomingFilter.emitDecoded(child, MessageDirection.Serverbound, povPlayer);

                if (child.canceled)
                    continue;
                    
                // send message to the perspective
                await activePerspective.decoder.emitDecoded(child, MessageDirection.Serverbound, connection);

                if (child.canceled)
                    continue;
                
                povNotCanceled.push(child);
            }

            if (povNotCanceled.length) {
                // broadcast all messages that weren't canceled to connections in this perspective
                await activePerspective.broadcastMessages(povNotCanceled, [], undefined, [connection], reliable);
            }
        }
    }
}