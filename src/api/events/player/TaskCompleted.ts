import { BasicEvent } from "@skeldjs/events";
import { Player } from "@skeldjs/au-core";

import { Room } from "../../../Room";

/**
 * Emitted when a player completes a task.
 */
export class PlayerTaskCompletedEvent extends BasicEvent {
    static eventName = "player.taskcompleted" as const;
    eventName = "player.taskcompleted" as const;

    constructor(
        public readonly room: Room,
        /**
         * The player who completed the task.
         */
        public readonly player: Player<Room>,
        /**
         * The type of task (from TaskType enum).
         */
        public readonly taskType: number,
        /**
         * The unique task ID.
         */
        public readonly taskId: number,
        /**
         * Whether this was a long/multi-step task.
         */
        public readonly isLongTask: boolean,
    ) {
        super();
    }
}
