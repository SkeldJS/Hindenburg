import { CancelableEvent } from "@skeldjs/events";
import { GameOptions } from "@skeldjs/protocol";
import { Connection } from "../../../Connection";
import { Room } from "../../../room";

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

    constructor(
        /**
         * The client that is attempting to create a room.
         */
        public readonly client: Connection,
        /**
         * The game options that the player is attempting to create a room with.
         */
        public readonly gameOptions: GameOptions
    ) {
        super();
    }
}