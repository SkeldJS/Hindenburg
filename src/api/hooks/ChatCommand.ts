import { Plugin, ChatCommandCallback, WorkerPlugin, RoomPlugin } from "../../handlers";

const hindenburgChatCommandKey = Symbol("hindenburg:chatcommand");

export interface PluginRegisteredChatCommandInfo {
    usage: string;
    description: string;
    handler: ChatCommandCallback;
}

export function ChatCommand(usage: string, description: string) :
    (
        target: any,
        propertyKey: string,
        descriptor: TypedPropertyDescriptor<ChatCommandCallback>
    ) => any;
export function ChatCommand(pluginClass: typeof WorkerPlugin|typeof RoomPlugin, usage: string, description: string) :
    (
        target: any,
        propertyKey: string,
        descriptor: TypedPropertyDescriptor<ChatCommandCallback>
    ) => any;
export function ChatCommand(pluginClassOrUsage: any, descriptionOrUsage: string, _description?: string) {
    return function(
        target: any,
        propertyKey: string,
        descriptor: TypedPropertyDescriptor<ChatCommandCallback>
    ) {
        if (!descriptor.value)
            return;

        const actualTarget = typeof pluginClassOrUsage === "string"
            ? target
            : pluginClassOrUsage.prototype;

        const usage = typeof pluginClassOrUsage === "string"
            ? pluginClassOrUsage
            : descriptionOrUsage;

        const description = typeof pluginClassOrUsage === "string"
            ? descriptionOrUsage
            : _description;

        const cachedSet: PluginRegisteredChatCommandInfo[]|undefined = Reflect.getMetadata(hindenburgChatCommandKey, actualTarget);
        const chatCommands = cachedSet || [];
        if (!cachedSet) {
            Reflect.defineMetadata(hindenburgChatCommandKey, chatCommands, actualTarget);
        }

        chatCommands.push({
            usage,
            description: description || "",
            handler: descriptor.value
        });
    };
}

export function getPluginChatCommands(pluginCtr: typeof Plugin|Plugin): PluginRegisteredChatCommandInfo[] {
    return Reflect.getMetadata(hindenburgChatCommandKey, pluginCtr) || [];
}
