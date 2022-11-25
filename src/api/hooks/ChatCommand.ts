import { PlayerData } from "@skeldjs/core";
import { Plugin, ChatCommandCallback, SomePluginCtr } from "../../handlers";
import { MethodDecorator } from "../types";

const hindenburgChatCommandKey = Symbol("hindenburg:chatcommand");

export type AccessCheckFn = (player: PlayerData) => any;

export interface PluginRegisteredChatCommandInfo {
    usage: string;
    description: string;
    accessCheck: AccessCheckFn;
    handler: ChatCommandCallback;
}

/**
 * A decorator to attach to a method in order to register a callback for a command
 * for players to use in the chat box in-game. Check out the [Chat Commands](https://hindenburg.js.org/pages/plugins/api/chat-commands.html)
 * page for more information.
 *
 * Can only be used on {@link WorkerPlugin}s.
 * @param usage How to use the command in [standard unix cli format](https://en.wikipedia.org/wiki/Command-line_interface#Command_description_syntax).
 * @param description A short description of what the command does and how to use it.
 */
export function ChatCommand(usage: string, description?: string): MethodDecorator<ChatCommandCallback>;
/**
 * A decorator to attach to a method in order to register a callback for a command
 * for players to use in the chat box in-game. Check out the [Chat Commands](https://hindenburg.js.org/pages/plugins/api/chat-commands.html)
 * page for more information.
 *
 * Can only be used on {@link WorkerPlugin}s.
 * @param usage How to use the command in [standard unix cli format](https://en.wikipedia.org/wiki/Command-line_interface#Command_description_syntax).
 * @param accessCheck A small function taking in a {@link PlayerData} object, returning
 * a boolean dictating whether or not the player is allowed to view/use the command.
 */
export function ChatCommand(usage: string, accessCheck: AccessCheckFn): MethodDecorator<ChatCommandCallback>;
/**
 * A decorator to attach to a method in order to register a callback for a command
 * for players to use in the chat box in-game. Check out the [Chat Commands](https://hindenburg.js.org/pages/plugins/api/chat-commands.html)
 * page for more information.
 *
 * Can only be used on {@link WorkerPlugin}s.
 * @param usage How to use the command in [standard unix cli format](https://en.wikipedia.org/wiki/Command-line_interface#Command_description_syntax).
 * @param description A short description of what the command does and how to use it.
 * @param accessCheck A small function taking in a {@link PlayerData} object, returning
 * a boolean dictating whether or not the player is allowed to view/use the command.
 */
export function ChatCommand(usage: string, description: string, accessCheck: AccessCheckFn): MethodDecorator<ChatCommandCallback>;
/**
 * A decorator to attach to a method in order to register a callback for a command
 * for players to use in the chat box in-game. Check out the [Chat Commands](https://hindenburg.js.org/pages/plugins/api/chat-commands.html)
 * page for more information.
 *
 * Can only be used on {@link WorkerPlugin}s.
 * @param pluginClass The class of the plugin to add this chat command to.
 * @param usage How to use the command in [standard unix cli format](https://en.wikipedia.org/wiki/Command-line_interface#Command_description_syntax).
 * @param description A short description of what the command does and how to use it.
 */
export function ChatCommand(pluginClass: SomePluginCtr, usage: string, description?: string): MethodDecorator<ChatCommandCallback>;
/**
 * A decorator to attach to a method in order to register a callback for a command
 * for players to use in the chat box in-game. Check out the [Chat Commands](https://hindenburg.js.org/pages/plugins/api/chat-commands.html)
 * page for more information.
 *
 * Can only be used on {@link WorkerPlugin}s.
 * @param pluginClass The class of the plugin to add this chat command to.
 * @param usage How to use the command in [standard unix cli format](https://en.wikipedia.org/wiki/Command-line_interface#Command_description_syntax).
 * @param accessCheck A small function taking in a {@link PlayerData} object, returning
 * a boolean dictating whether or not the player is allowed to view/use the command.
 */
export function ChatCommand(pluginClass: SomePluginCtr, usage: string, accessCheck?: AccessCheckFn): MethodDecorator<ChatCommandCallback>;
/**
 * A decorator to attach to a method in order to register a callback for a command
 * for players to use in the chat box in-game. Check out the [Chat Commands](https://hindenburg.js.org/pages/plugins/api/chat-commands.html)
 * page for more information.
 *
 * Can only be used on {@link WorkerPlugin}s.
 * @param pluginClass The class of the plugin to add this chat command to.
 * @param usage How to use the command in [standard unix cli format](https://en.wikipedia.org/wiki/Command-line_interface#Command_description_syntax).
 * @param description A short description of what the command does and how to use it.
 * @param accessCheck A small function taking in a {@link PlayerData} object, returning
 * a boolean dictating whether or not the player is allowed to view/use the command.
 */
export function ChatCommand(pluginClass: SomePluginCtr, usage: string, description: string, accessCheck: AccessCheckFn): MethodDecorator<ChatCommandCallback>;
export function ChatCommand(...args: any[]) {
    return function(
        target: any,
        propertyKey: string,
        descriptor: TypedPropertyDescriptor<ChatCommandCallback>
    ) {
        if (!descriptor.value)
            return;

        const actualTarget = typeof args[0] === "string"
            ? target
            : args.shift().prototype;

        const [ usage ] = args;
        let [ , description, accessCheck ] = args;

        if (typeof description === "function") {
            accessCheck = description;
            description = undefined;
        }

        const cachedSet: PluginRegisteredChatCommandInfo[]|undefined = Reflect.getMetadata(hindenburgChatCommandKey, actualTarget);
        const chatCommands = cachedSet || [];
        if (!cachedSet) {
            Reflect.defineMetadata(hindenburgChatCommandKey, chatCommands, actualTarget);
        }

        chatCommands.push({
            usage,
            description: description || "",
            accessCheck: accessCheck || (() => true),
            handler: descriptor.value
        });
    };
}

export function getPluginChatCommands(pluginCtr: typeof Plugin|Plugin): PluginRegisteredChatCommandInfo[] {
    return Reflect.getMetadata(hindenburgChatCommandKey, pluginCtr) || [];
}
