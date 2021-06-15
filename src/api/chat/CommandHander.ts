import { Color } from "@skeldjs/constant";
import {
    RpcMessage,
    SendChatMessage,
    SetColorMessage,
    SetNameMessage
} from "@skeldjs/protocol";

import { Player, Room } from "../../room";
import { Worker } from "../../Worker";

function betterSplitOnSpaces(input: string) {
    let collector = "";
    let output = [];
    let in_string = false;
    for (const char of input) {
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
    isRest: boolean;
    required: boolean;
    name: string;
}

export class CallError extends Error {};

export class ChatCommandContext {
    constructor(
        public readonly room: Room,
        public readonly player: Player,
        public readonly message: string
    ) {}

    async reply(message: string) {
        if (!this.player.components.control)
            return;

        const oldName = this.player.info?.name;
        const oldColor = this.player.info?.color;
        
        if (!oldName || !oldColor)
            return;

        // todo: better way of doing this (room api method?)
        await this.room.broadcastMessages([
            new RpcMessage(
                this.player.components.control.netid,
                new SetNameMessage("[Server]")
            ),
            new RpcMessage(
                this.player.components.control.netid,
                new SetColorMessage(Color.Yellow)
            ),
            new RpcMessage(
                this.player.components.control.netid,
                new SendChatMessage(message)
            ),
            new RpcMessage(
                this.player.components.control.netid,
                new SetNameMessage(oldName)
            ),
            new RpcMessage(
                this.player.components.control.netid,
                new SetColorMessage(oldColor)
            ),
        ], undefined, [this.player], undefined);
    }
}

export type ChatCommandCallback = (ctx: ChatCommandContext, args: any) => any;

export class RegisteredChatCommand {
    constructor(
        public readonly name: string,
        public readonly params: ChatCommandParameter[],
        public readonly callback: ChatCommandCallback
    ) {}

    static parse(usage: string, callback: ChatCommandCallback) {
        // https://github.com/dthree/vorpal/blob/51f5e2b545631b6a86c9781c274a1b0916a67ee8/lib/vorpal.js#L311
        const matchedParams = usage.match(/(\[[^\]]*\]|\<[^\>]*\>)/g) || [];
        const matchedCmdName = usage.match(/^([^\[\<]*)/g)?.[0]?.trim() || "";

        if (!matchedCmdName)
            throw new TypeError("Invalid command name.");

        if (matchedCmdName.includes("  "))
            throw new TypeError("Command name cannot contain spaces.");

        const cmdParams: ChatCommandParameter[] = [];

        let wasOptional = false; // Flag to prevent required parameters from coming after optional ones
        for (let i = 0; i < matchedParams.length; i++) {
            let matchedParam = matchedParams[i];
            const param: ChatCommandParameter = {
                isRest: false,
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
            if (matchedParam.startsWith("...")) {
                param.isRest = true;
                matchedParam = matchedParam.substr(3); // Remove leading ...
                if (i !== matchedParams.length - 1) {
                    throw new TypeError("Rest parameter must be last.");
                }
            }
            param.name = matchedParam;
            cmdParams.push(param);
        }

        const chatCommand = new RegisteredChatCommand(matchedCmdName, cmdParams, callback);
        return chatCommand;
    }

    createUsage() {
        return "/" + this.name + " " + this.params.map(param => {
            return (param.required ? "<" : "[")
                + (param.isRest ? "..." : "")
                + param.name
                + (param.required ? ">" : "]");
        }).join(" ");
    }

    verify(args: string[]): Record<string, string> {
        const argsCloned = [...args]; // Clone the array to not affect the original arguments array
        const parsed: Record<string, string> = {};

        for (const param of this.params) {
            const consume = param.isRest
                ? argsCloned.join(" ")
                : argsCloned.shift();

            if (!consume) {
                if (param.required) {
                    throw new CallError("Missing parameter: " + param.name);
                }
                return parsed; // No more arguments are left to consume
            }

            parsed[param.name] = consume;
        }

        return parsed;
    }
}

export class ChatCommandHandler {
    commands: Map<string, RegisteredChatCommand>;

    constructor(
        public readonly worker: Worker
    ) {
        this.commands = new Map;

        this.worker.on("player.chat", async ev => {
            if (ev.message.startsWith("/")) {
                ev.rpc.cancel(); // Prevent message from being broadcasted
                const restMessage = ev.message.substr(1);
                const context = new ChatCommandContext(ev.room, ev.player, ev.message);
                try {
                    await this.parseMessage(context, restMessage);
                } catch (e) {
                    if (e instanceof CallError) {
                        await context.reply(e.message);
                    } else {
                        this.worker.logger.error("Error while executing command %s: %s",
                            ev.message, e);
                    }
                }
            }
        });

        this.registerCommand("help", async (ctx, args) => {
            let outMessage = "Listing " + this.commands.size + " command(s):";
            for (const [ , command ] of this.commands) {
                outMessage += "\n" + command.createUsage();
            }
            await ctx.reply(outMessage);
        });
    }

    registerCommand(usage: string, callback: ChatCommandCallback) {
        const parsedCommand = RegisteredChatCommand.parse(usage, callback);
        this.commands.set(parsedCommand.name, parsedCommand);
    }

    async parseMessage(ctx: ChatCommandContext, message: string) {
        const args = betterSplitOnSpaces(message);
        const commandName = args.shift();

        if (!commandName)
            throw new CallError("Bad command call.");

        const command = this.commands.get(commandName);

        if (!command)
            throw new CallError("No command with name: " + commandName);

        const parsed = command.verify(args);

        await command.callback(ctx, parsed);
    }
}