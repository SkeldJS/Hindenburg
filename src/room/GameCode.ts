import chalk from "chalk";

import { HostGameMessage, RemoveGameMessage } from "@skeldjs/protocol";
import { Code2Int, Int2Code } from "@skeldjs/util";
import { Room } from "./Room";

export class GameCode {
    /**
     * The game code as an integer, should be used to identify the room internally.
     * See {@link GameCode.name} to get the code as a 4 or 6 letter string, or see
     * {@link GameCode.displayName} to get the code as it appears for clients.
     */
    id: number;
    
    /**
     * Whether the game code is currently hidden for clients.
     */
    hidden: boolean;

    constructor(
        public readonly room: Room,
        code: number|string
    ) {
        if (typeof code === "string") {
            this.id = Code2Int(code);
        } else {
            this.id = code;
        }

        this.hidden = false;
    }
    
    [Symbol.for("nodejs.util.inspect.custom")]() {
        if (this.hidden) {
            return chalk.grey(this.name);
        } else {
            return chalk.yellow(this.name);
        }
    }

    /**
     * The game code as a string of 4 or 6 letters.
     */
    get name() {
        return Int2Code(this.id);
    }

    /**
     * How the game code appears for clients.
     */
    get displayName() {
        if (this.hidden) {
            return "";
        } else {
            return this.name;
        }
    }

    /**
     * How the game code is networked.
     */
    get networkName() {
        if (this.hidden) {
            return "[aa]";
        } else {
            return this.name;
        }
    }

    /**
     * Immediately update the game code for all clients.
     */
    async update() {
        await this.room.broadcastMessages([], [
            new HostGameMessage("ABCDEF")
        ]);
    }

    /**
     * Update the game code for the room.
     * @param code The game code as either an integer or a string.
     * @param doUpdate Whether to immediately update the code for all clients. (Calls {@link GameCode.update})
     * @example
     * ```ts
     * // Set the code of the room to "ABCDEF";
     * const room = new Room(worker);
     * room.setCode("ABCDEF");
     * ```
     */
    async set(code: string|number, doUpdate: boolean = true): Promise<void> {
        if (typeof code === "string") {
            if (code.length !== 4 && code.length !== 6) {
                throw new RangeError("Expected a 4 or 6 digit room code.");
            }

            return this.set(Code2Int(code), doUpdate);
        }

        if (this.room.worker.rooms.has(code))
            throw new Error("A room with code '" + Int2Code(code) + "' already exists.");


        this.id = code;
        if (doUpdate) {
            await this.update();
        }
    }

    /**
     * Make the code display for all clients.
     */
    async show() {
        this.hidden = false;
        await this.update();
    }

    /**
     * Mkae the code hidden for all clients.
     */
    async hide() {
        this.hidden = true;
        await this.update();
    }
}