import { PlayerData } from "@skeldjs/core";
import { BaseGameDataMessage, DataMessage, GameSettings, MessageDirection, SendChatMessage, SetColorMessage, SetHatMessage, SetNameMessage, SetPetMessage, SetSkinMessage, SnapToMessage, SyncSettingsMessage } from "@skeldjs/protocol";
import { RoomsConfig } from "./interfaces";

import { Worker } from "./Worker";
import { BaseRoom } from "./BaseRoom";
import { Perspective, PresetFilter } from "./Perspective";
import { Connection } from ".";

export class Room extends BaseRoom {
    /**
     * A map of player client IDs to active perspectives in the room. Used as a
     * short-hand, as well as being faster than searching each active perspective.
     */
    playerPerspectives: Map<number, Perspective>;

    /**
     * A list of perspectives that are currently active in the room, see {@link Room.createPerspective}
     */
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

    /**
     * Create a {@link Perspective} object for this room, with preset filters to
     * use.
     * 
     * Note that this function is relatively slow, as it needs to clone the entire
     * room. As such, it should really not be used in a loop or any events that
     * occur often.
     * 
     * @param players The player, or players, to create this perspective for.
     * @param filters Preset filters to use for the perspective.
     * @returns The created perspective.
     */
    createPerspective(players: PlayerData|PlayerData[], filters: PresetFilter[] = []): Perspective {
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
            if (filter === PresetFilter.GameDataUpdates) {
                perspective.incomingFilter.on([ SetColorMessage, SetNameMessage, SetSkinMessage, SetPetMessage, SetHatMessage ], message => {
                    message.cancel();
                });
            } else if (filter === PresetFilter.PositionUpdates) {
                perspective.incomingFilter.on([ SnapToMessage ], message => {
                    message.cancel();
                });

                perspective.incomingFilter.on([ DataMessage ], message => {
                    const netobject = perspective.netobjects.get(message.netid);

                    if (netobject?.classname === "CustomNetworkTransform") {
                        message.cancel();
                    }
                });
            } else if (filter === PresetFilter.SettingsUpdates) {
                perspective.incomingFilter.on([ SyncSettingsMessage ], message => {
                    message.cancel();
                });
            } else if (filter === PresetFilter.ChatMessages) {
                perspective.incomingFilter.on([ SendChatMessage ], message => {
                    message.cancel();
                });
            }
        }

        return perspective;
    }

    /**
     * Broadcast gamedata messages to each active perspective, respecting their
     * incoming filter. As a necessecity, this also broadcasts these messages to
     * players in the perpsectives whereas they would not normally have received
     * them.
     * @param connection The connection that sent these messages.
     * @param messages The messages in question.
     * @param reliable Whether these messages should be sent reliably (i.e. movement packets would be unreliable.
     */
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