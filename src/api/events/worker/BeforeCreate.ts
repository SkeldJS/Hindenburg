import { CancelableEvent } from "@skeldjs/events";
import { GameSettings } from "@skeldjs/protocol";
import { Code2Int } from "@skeldjs/util";
import { Connection } from "../../../Connection";

/**
 * Emitted before a player successfully or unsuccessfully creates a room.
 * 
 * This event allows you to prevent players from creating games, or allow
 * custom game codes.
 * 
 * @example
 * ```ts
 * .@EventListener("worker.beforecreate")
 * onWorkerBeforeCreate(ev: WorkerBeforeCreateEvent) {
 *   if (ev.client.mods.size > 0) {
 *     ev.cancel();
 *     return ev.client.joinError("You cannot create a game with Reactor enabled!!!");
 *   }
 * }
 * ```
 */
export class WorkerBeforeCreateEvent extends CancelableEvent {
    static eventName = "worker.beforecreate" as const;
    eventName = "worker.beforecreate" as const;

    private _alteredGameCode: number | undefined;

    /**
     * The new game code if it was altered
     */
    get alteredGameCode() {
        return this._alteredGameCode;
    }

    /**
     * Change the game code for the room
     * @param gameCode The new game code
     */
    setCode(gameCode: number | string) {
        if(typeof gameCode == "string") {
            this.setCode(Code2Int(gameCode));
            return;
        }
        this._alteredGameCode = gameCode;
    }

    constructor(
        /**
         * The client that is attempting to create a room.
         */
        public readonly client: Connection,
        /**
         * The game options that the player is attempting to create a room with.
         */
        public readonly gameOptions: GameSettings
    ) {
        super();
    }
}