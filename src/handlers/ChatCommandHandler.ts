import util from "util";

import { Player } from "@skeldjs/core";

import { Room, MessageSide } from "../Room";
import { AccessCheckFn } from "../api";

function betterSplitOnSpaces(input: string) {
    let collector = "";
    const output = [];
    let in_string = false;
    for (let i = 0; i < input.length; i++) {
        const char = input[i];

        if (char === "'") {
            in_string = !in_string;
        } else if (char === " " && !in_string) {
            output.push(collector);
            collector = "";
        } else {
            collector += char;
        }
    }
    if (collector)
        output.push(collector);

    return output;
}

export interface ChatCommandParameter {
    variadic: boolean;
    required: boolean;
    name: string;
}

export class CommandCallError extends Error { }
export class ChatCommandContext {
    constructor(
        /**
         * The room that this command came from.
         */
        public readonly room: Room,
        /**
         * The player that sent the message calling the command.
         */
        public readonly player: Player<Room>,
        /**
         * The original message that the player sent (without the leading '/').
         */
        public readonly message: string
    ) { }

    /**
     * Reply to the message that called this command.
     * @summary Calls {@link Room.sendChat}
     * @param message The message to reply with.
     */
    async reply(message: string, ...fmt: any) {
        await this.room.sendChat(util.format(message, ...fmt), {
            side: MessageSide.Left,
            targets: [this.player]
        });
    }
}

export type ChatCommandCallback = (ctx: ChatCommandContext, args?: any) => any;

export class ChatCommandUsage {
    constructor(public readonly name: string, public readonly params: ChatCommandParameter[]) { }

    /**
     * Create a formatted usage of this command, in [standard unix command-line
     * command syntax](https://en.wikipedia.org/wiki/Command-line_interface#Command_description_syntax).
     */
    toString(prefix = "/") {
        return prefix + this.name + " " + this.params.map(param => {
            return (param.required ? "<" : "[")
                + param.name
                + (param.required ? ">" : "]");
        }).join(" ");
    }
}

export class RegisteredChatCommand {
    constructor(
        public readonly usage: ChatCommandUsage,
        public readonly description: string,
        public readonly accessCheck: AccessCheckFn,
        public readonly callback: ChatCommandCallback
    ) { }

    static parseCommandUsageString(usage: string) {
        // https://github.com/dthree/vorpal/blob/51f5e2b545631b6a86c9781c274a1b0916a67ee8/lib/vorpal.js#L311
        const matchedParams = usage.match(/(\[[^\]]*\]|<[^>]*>)/g) || [];
        const matchedCmdName = usage.match(/^([^[<]*)/g)?.[0]?.trim() || "";

        if (!matchedCmdName)
            throw new TypeError("Invalid command name.");

        if (matchedCmdName.includes("  "))
            throw new TypeError("Command name cannot contain spaces.");

        const cmdParams: ChatCommandParameter[] = [];

        let wasOptional = false; // Flag to prevent required parameters from coming after optional ones
        for (let i = 0; i < matchedParams.length; i++) {
            let matchedParam = matchedParams[i];
            const param: ChatCommandParameter = {
                variadic: false,
                required: false,
                name: ""
            };
            if (matchedParam.startsWith("[")) {
                wasOptional = true;
            }
            if (matchedParam.startsWith("<")) {
                if (wasOptional) { // Check if an optional parameter has come before
                    throw new TypeError("Required parameter cannot come after an optional parameter.");
                }
                param.required = true;
            }
            matchedParam = matchedParam.substr(1, matchedParam.length - 2); // Remove surrounding parameter markers, [ ] and < >
            if (matchedParam.endsWith("...")) {
                param.variadic = true;
                matchedParam = matchedParam.substr(0, matchedParam.length - 3); // Remove trailing ...
                if (i !== matchedParams.length - 1) {
                    throw new TypeError("Rest parameter must be last.");
                }
            }
            param.name = matchedParam;
            cmdParams.push(param);
        }

        return new ChatCommandUsage(matchedCmdName, cmdParams);
    }

    static parse(usageString: string, description: string, accessCheck: AccessCheckFn, callback: ChatCommandCallback) {
        const usage = this.parseCommandUsageString(usageString);
        const chatCommand = new RegisteredChatCommand(usage, description, accessCheck, callback);
        return chatCommand;
    }

    /**
     * Verify that an array of arguments correctly fits the usage of this command.
     * @param args The arguments to verify.
     * @returns The arguments mapped from parameter name to value of the argument
     * passed.
     */
    checkArguments(prefix: string, args: string[]): Record<string, string> | CommandCallError {
        const argsCloned = [...args]; // Clone the array to not affect the original arguments array
        const parsed: Record<string, string> = {};

        for (let i = 0; i < this.usage.params.length; i++) {
            const param = this.usage.params[i];
            const consume = param.variadic
                ? argsCloned.join(" ")
                : argsCloned.shift();

            if (!consume) {
                if (param.required) {
                    return new CommandCallError("Usage: " + this.usage.toString(prefix) + "\nMissing '" + param.name + "'\n\n" + (this.description || "No description."));
                }
                return parsed; // No more arguments are left to consume
            }

            parsed[param.name] = consume;
        }

        return parsed;
    }
}

export class ChatCommandHandler {
    registeredCommands: Map<string, RegisteredChatCommand>;

    constructor(
        public readonly room: Room
    ) {
        this.registeredCommands = new Map;
        this.registerHelpCommand();
    }

    registerHelpCommand() {
        this.registerCommand("help [command/page]", "Get a list of commands and how to use them, or get help for a specific command.", () => true, async (ctx, args) => {
            if (typeof ctx.room.config.chatCommands === "object" && ctx.room.config.chatCommands.helpCommand === false /* can be undefined */) {
                return;
            }

            const prefix = typeof ctx.room.config.chatCommands === "object"
                ? ctx.room.config.chatCommands.prefix || "/"
                : "/";

            const maxDisplay = 4;

            const pageArg = parseInt(args["command/page"]);
            const commandName = args["command/page"];

            if (commandName && isNaN(pageArg)) {
                const command = this.registeredCommands.get(commandName);

                if (!command || !command.accessCheck(ctx.player)) {
                    await ctx.reply("No command with name: %s", commandName);
                    return;
                }

                await ctx.reply("Usage: " + command.usage.toString(prefix) + "\n\n" + (command.description || "No description."));
                return;
            }


            const availableCommands = this.getAvailableCommandsForPlayer(ctx.player);

            const maxPages = Math.ceil(availableCommands.length / maxDisplay);
            const displayPage = isNaN(pageArg) ? 1 : pageArg;
            const actualPage = displayPage - 1;

            if (actualPage * maxDisplay >= availableCommands.length || actualPage < 0) {
                await ctx.reply("There are no commands on page %s.", displayPage);
                return;
            }

            let outMessage = "";
            let num = 0;
            for (
                let i = actualPage * maxDisplay; // start on requested page
                i < availableCommands.length && i < (actualPage + 1) * maxDisplay; // loop until no commands left or page ends
                i++
            ) {
                const command = availableCommands[i];
                outMessage += "\n\n" + command.usage.toString(prefix) + " - " + (command.description || "No description.");
                num++;
            }

            if (num === maxDisplay && displayPage < maxPages) {
                outMessage += "\n\nUse " + prefix + "help " + (displayPage + 1) + " for more commands.";
            }

            await ctx.reply(
                "Listing " + num + " command" + (num === 1 ? "" : "s") + " on page " + displayPage + "/" + maxPages + ":\n\n"
                + outMessage.trim()
            );
        });
    }

    /**
     * Register a command into the command handler.
     * @param usageString How to use the command in [standard unix command-line command
     * syntax](https://en.wikipedia.org/wiki/Command-line_interface#Command_description_syntax).
     * @param description A short summary of what the command does, how to use it, etc.
     * @param accessCheck A function to determine whether a player can view this command.
     * @param callback A callback function for when the command is called.
     * @returns The command that was parsed.
     * @example
     * ```ts
     * worker.chatCommandHandler.parseMessage("ping", "Ping the server.", (ctx, args) => {
     *   ctx.reply("pong!");
     * });
     * ```
     */
    registerCommand(usageString: string, description: string, accessCheck: AccessCheckFn, callback: ChatCommandCallback) {
        const parsedCommand = RegisteredChatCommand.parse(usageString, description, accessCheck, callback);
        this.registeredCommands.set(parsedCommand.usage.name, parsedCommand);
        return parsedCommand;
    }

    /**
     * Remove a command from the command handler.
     * @param commandName The name of the command to be removed, should be {@link RegisteredChatCommand.name}.
     * ```ts
     * worker.chatCommandHandler.removeCommand("ping");
     * ```
     */
    removeCommand(commandName: string) {
        if (!this.registeredCommands.has(commandName))
            throw new TypeError("No command: " + commandName);

        this.registeredCommands.delete(commandName);
    }

    /**
     * Parse a message calling a command. Does not trim off a leading command prefix.
     * @param ctx Context for the message.
     * @param message The message to parse.
     * @example
     * ```ts
     * const message = "setname weakeyes";
     * const ctx = new ChatCommandContext(room, room.players.host, message);
     *
     * await worker.chatCommandHandler.parseMessage(ctx, message);
     * ```
     */
    async parseMessage(ctx: ChatCommandContext, message: string) {
        const args = betterSplitOnSpaces(message);
        const commandName = args.shift();

        if (!commandName)
            throw new CommandCallError("Bad command call.");

        const command = this.registeredCommands.get(commandName);

        if (!command || !command.accessCheck(ctx.player))
            throw new CommandCallError("No command with name: " + commandName);

        const prefix = typeof ctx.room.config.chatCommands === "object"
            ? ctx.room.config.chatCommands.prefix || "/"
            : "/";

        const parsed = command.checkArguments(prefix, args);
        await command.callback(ctx, parsed);
    }

    /**
     * Get all commands for a player that are available to them and can use.
     * @param player The player to get available cmomands for.
     * @returns All commands that {@link player} can use.
     */
    getAvailableCommandsForPlayer(player: Player<Room>) {
        return [...this.registeredCommands.values()].filter(command => command.accessCheck(player));
    }
}
