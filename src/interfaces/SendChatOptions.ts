import { PlayerData } from "@skeldjs/core";
import { Color } from "@skeldjs/constant";

export enum MessageSide {
    Left,
    Right
}

/**
 * Options regarding sending a chat message into the room as the server, see
 * {@link Room.sendChat}
 */
export interface SendChatOptions {
    /**
     * The side of the chat box for the message to appear on for each player.
     * @example
     * ```ts
     * room.sendChat("Slide to the left", {
     *   side: MessageSide.Left
     * });
     *
     * room.sendChat("Slide to the right", {
     *   side: MessageSide.Right
     * });
     * ```
     */
    side: MessageSide;
    /**
     * The player to send the message to, if omitted, sends to all players.
     * @example
     * ```ts
     * // Alert the host of a hacker
     * .@EventListener("anticheat.potential")
     * onPotentialCheater(ev: AnticheatPotentialEvent) {
     *   if (!ev.player.info)
     *     return;
     *
     *   ev.room.sendChat("<color=red>Potential cheater detected: " + ev.player.info.name + "</color>", {
     *     targets: [ ev.room.players.host ]
     *   });
     * }
     * ```
     */
    targets: PlayerData[]|undefined;
    /**
     * The name of the player to appear as.
     * @example
     * ```ts
     * ev.room.sendChat("i am the impostor", {
     *   name: "<color=red>The Impostor</color>",
     *   color: Color.Red
     * });
     * ```
     */
    name: string;
    /**
     * The color of the player to appear as.
     * @example
     * ```ts
     * ev.room.sendChat("i am the impostor", {
     *   name: "<color=red>The Impostor</color>",
     *   color: Color.Red
     * });
     * ```
     */
    color: Color;
}
