import { CancelableEvent } from "@skeldjs/events";
import { GameSettings } from "@skeldjs/protocol";
import { GameCode } from "@skeldjs/util";
import { Connection } from "../../../worker";

/**
 * Emitted before a player successfully or unsuccessfully creates a room.
 *
 * This event allows you to prevent players from creating rooms, or allow
 * custom room codes.
 *
 * @example
 * ```ts
 * .@EventListener("room.beforecreate")
 * onWorkerBeforeCreate(ev: WorkerBeforeCreateEvent) {
 *   if (ev.client.mods.size > 0) {
 *     ev.cancel();
 *     return ev.client.disconnect("You cannot create a room with Reactor enabled!!!");
 *   }
 * }
 * ```
 */
export class RoomBeforeCreateEvent extends CancelableEvent {
    static eventName = "room.beforecreate" as const;
    eventName = "room.beforecreate" as const;

    private _alteredRoomCode: number;

    constructor(
        /**
         * The client that is attempting to create a room.
         */
        public readonly client: Connection,
        /**
         * The game options that the player is attempting to create a room with.
         */
        public readonly gameOptions: GameSettings,
        /**
         * The game code of the room that will be created.
         */
        public readonly roomCode: number
    ) {
        super();

        this._alteredRoomCode = roomCode;
    }

    /**
     * The new room code if it was altered.
     */
    get alteredRoomCode() {
        return this._alteredRoomCode;
    }

    /**
     * Change the room code for the room.
     * @param roomCode The new room code
     */
    setCode(roomCode: number | string) {
        if (typeof roomCode === "string") {
            this.setCode(GameCode.convertStringToInt(roomCode));
            return;
        }

        this._alteredRoomCode = roomCode;
    }
}
