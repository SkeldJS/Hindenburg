import { PlayerData, RoleTeamType } from "@skeldjs/core";
import { Plugin, ChatCommandCallback, SomePluginCtr } from "../../handlers";

const hindenburgChatCommandKey = Symbol("hindenburg:chatcommand");

export type AccessCheckFn = (player: PlayerData) => boolean;

export interface PluginRegisteredChatCommandInfo {
    usage: string;
    description?: string;
    accessCheck?: AccessCheckFn;
    handler: ChatCommandCallback;
}

export function ChatCommand(usage: string, description?: string) :
    (
        target: any,
        propertyKey: string,
        descriptor: TypedPropertyDescriptor<ChatCommandCallback>
    ) => any;
export function ChatCommand(usage: string, description?: string, accessCheck?: AccessCheckFn) :
    (
        target: any,
        propertyKey: string,
        descriptor: TypedPropertyDescriptor<ChatCommandCallback>
    ) => any;
export function ChatCommand(pluginClass: SomePluginCtr, usage: string, description?: string, accessCheck?: AccessCheckFn) :
    (
        target: any,
        propertyKey: string,
        descriptor: TypedPropertyDescriptor<ChatCommandCallback>
    ) => any;
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

        let [ usage, description, accessCheck ] = args;

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
            description,
            accessCheck,
            handler: descriptor.value
        });
    };
}

export function getPluginChatCommands(pluginCtr: typeof Plugin|Plugin): PluginRegisteredChatCommandInfo[] {
    return Reflect.getMetadata(hindenburgChatCommandKey, pluginCtr) || [];
}
