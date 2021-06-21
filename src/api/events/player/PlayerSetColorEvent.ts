import { Color } from "@skeldjs/constant";
import { RevertableEvent } from "@skeldjs/events";
import { SetColorMessage } from "@skeldjs/protocol";

import { Room, Player } from "../../../room";
import { RoomEvent } from "../RoomEvent";
import { RpcEvent } from "../RpcEvent";
import { PlayerEvent } from "./PlayerEvent";

/**
 * Emitted after a player updates their color. This event is revertable.
 * @example
 * ```ts
 * // Offset everyone's color by 1
 * onSetColor(ev: PlayerSetColorEvent) {
 *   ev.setColor((ev.color + 1) % 12);
 * }
 * ```
 * @example
 * ```ts
 * // Force everyone's color to be red
 * onSetColor(ev: PlayerSetColorEvent) {
 *   ev.setColor(Color.Red);
 * }
 * ```
 */
export class PlayerSetColorEvent extends RevertableEvent implements RoomEvent, PlayerEvent, RpcEvent {
    static eventName = "player.setcolor" as const;
    eventName = "player.setcolor" as const;

    /**
     * The color that has been altered through {@link PlayerSetColorEvent.setColor},
     * and will be updated after, if changed.
     */
    alteredColor: Color;

    constructor(
        public readonly room: Room,
        public readonly player: Player,
        public readonly rpc: SetColorMessage,
        /**
         * The color that the player had before.
         */
        public readonly oldColor: Color,
        /**
         * The new color that the player has.
         */
        public readonly color: Color
    ) {
        super();

        Color

        this.alteredColor = color;
    }

    /**
     * Change the color that was set, re-emits a [SetColor](https://github.com/codyphobe/among-us-protocol/blob/master/04_rpc_message_types/08_setcolor.md)
     * rpc at the end of the event to all players if different.
     * @param color The new color to set.
     */
    setColor(color: Color) {
        this.alteredColor = color;
    }
}