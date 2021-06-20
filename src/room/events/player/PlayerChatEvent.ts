import { BasicEvent } from "@skeldjs/events";
import { SendChatMessage } from "@skeldjs/protocol";

import { Player } from "../../Player";
import { Room } from "../../Room";
import { RoomEvent } from "../RoomEvent";
import { RpcEvent } from "../RpcEvent";
import { PlayerEvent } from "./PlayerEvent";

/**
 * Emitted when a player sends a chat msesage.
 * 
 * Due to client limitations, this event can't be canceled or reverted, however
 * the {@link PlayerChatEvent.rpc} can, preventing it from being sent to other
 * clients.
 */
export class PlayerChatEvent extends BasicEvent implements RoomEvent, PlayerEvent, RpcEvent {
    static eventName = "player.chat" as const;
    eventName = "player.chat" as const;

    constructor(
        public readonly room: Room,
        public readonly player: Player,
        public readonly rpc: SendChatMessage,
        /**
         * The message that the player sent.
         */
        public readonly message: string
    ) {
        super();
    }
}