import { RevertableEvent } from "@skeldjs/events";
import { SetNameMessage } from "@skeldjs/protocol";
import { Player } from "../../Player";
import { Room } from "../../Room";
import { RoomEvent } from "../RoomEvent";
import { RpcEvent } from "../RpcEvent";
import { PlayerEvent } from "./PlayerEvent";

/**
 * Emitted after a player updates their name. This event is revertable.
 * @example
 * ```ts
 * // Make everyone's name red
 * onSetName(ev: PlayerSetNameEvent) {
 *   ev.setName("<color=ff0000ff>" + ev.name + "</color>");
 * }
 * ```
 */
export class PlayerSetNameEvent extends RevertableEvent implements RoomEvent, PlayerEvent, RpcEvent {
    static eventName = "player.setname";
    eventName = "player.setname";

    /**
     * The name that has been altered throuh {@link PlayerSetNameEvent.setName},
     * and will be updated after, if changed.
     */
    alteredName: string;

    constructor(
        public readonly room: Room,
        public readonly player: Player,
        public readonly rpc: SetNameMessage,
        /**
         * The name that the player had before.
         */
        public readonly oldName: string,
        /**
         * The new name that the player has.
         */
        public readonly name: string
    ) {
        super();

        this.alteredName = name;
    }

    /**
     * Change the name that was set, re-emits a [SetName](https://github.com/codyphobe/among-us-protocol/blob/master/04_rpc_message_types/06_setname.md)
     * rpc at the end of the event to all players if different.
     * @param name The new name to set.
     */
    setName(name: string) {
        this.alteredName = name;
    }
}