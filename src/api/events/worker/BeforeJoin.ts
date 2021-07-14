import { CancelableEvent } from "@skeldjs/events";
import { Connection } from "../../../Connection";
import { Room } from "../../../Room";

/**
 * Emitted before a player successfully or unsuccessfully joins a room on the
 * server.
 * 
 * This event allows you to redirect the player to another game, or to completely
 * prevent them from joining.
 * 
 * A better event to use for when a player has successfully joined a room is
 * the [`player.join`](https://skeld.js.org/classes/core.playerjoinevent.html)
 * event.
 * 
 * @example
 * ```ts
 * .@EventListener("worker.beforejoin")
 * onWorkerBeforeJoin(ev: WorkerBeforeJoinEvent) {
 *   for (const [ netId, mod ] of ev.client.mods) {
 *     if (mod.modid === "com.andruzzzhka.customserversclient") {
 *       ev.cancel();
 *       return ev.client.joinError("Do not join with custom servers client!!!");
 *     }
 *   }
 * }
 * ```
 */
export class WorkerBeforeJoinEvent extends CancelableEvent {
    static eventName = "worker.beforejoin" as const;
    eventName = "worker.beforejoin" as const;

    private _alteredRoom: Room|undefined;

    constructor(
        /**
         * The client that is attempting to join the room.
         */
        public readonly client: Connection,
        /**
         * The game code that the player used to search for a room.
         */
        public readonly gameCode: number,
        /**
         * The room that was found, or `undefined` if there is no room on the
         * server with the code.
         */
        public readonly foundRoom: Room|undefined
    ) {
        super();

        this._alteredRoom = foundRoom;
    }

    /**
     * The room that the player will join instead, if changed.
     */
    get alteredRoom() {
        return this._alteredRoom;
    }

    /**
     * Change the room that the player will join.
     * @param room The room that the player will join instead, set to `undefined`
     * to give the player a "Game Not Found" error.
     */
    setRoom(room: Room|undefined) {
        this._alteredRoom = room;
    }
}