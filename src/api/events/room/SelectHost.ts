import { CancelableEvent } from "@skeldjs/events";
import { Connection, Room } from "../../../worker";

/**
 * Emitted when the room selects the next host in the room.
 *
 * Can be used to change the default host selection, especially combined with the
 * {@link RoomSelectHostEvent.isActingHost} and {@link RoomSelectHostEvent.isJoining} flags.
 */
export class RoomSelectHostEvent extends CancelableEvent {
    static eventName = "room.selecthost" as const;
    eventName = "room.selecthost" as const;

    private _alteredSelected: Connection;

    constructor(
        public readonly room: Room,
        /**
         * Whether or not this is for an acting host (in server-as-a-host).
         */
        public readonly isActingHost: boolean,
        /**
         * Whether or not this player is being selected because they just joined
         * and no one else is the host.
         */
        public readonly isJoining: boolean,
        /**
         * The host that is to be selected as host.
         */
        public readonly selected: Connection
    ) {
        super();

        this._alteredSelected = selected;
    }

    /**
     * The new host to be selected instead of the one in {@link RoomSelectHostEvent.selected}.
     */
    get alteredSelected() {
        return this._alteredSelected;
    }

    /**
     * Change the host to be selected instead of {@link RoomSelectHostEvent.selected}.
     * @param host The host to be selected.
     */
    selectHost(host: Connection) {
        this._alteredSelected = host;
    }
}
