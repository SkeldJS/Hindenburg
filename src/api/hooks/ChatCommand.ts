import { ChatCommandCallback } from "../../handlers/ChatCommandHandler";

export const hindenburgChatCommandKey = Symbol("hindenburg:chatcommand");

export function ChatCommand(usage: string, description: string) :
    (
        target: any,
        propertyKey: string,
        descriptor: TypedPropertyDescriptor<ChatCommandCallback>
    ) => any;
export function ChatCommand(pluginClass: typeof Plugin, usage: string, description: string) :
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
        const actualTarget = typeof pluginClassOrUsage === "string"
            ? target
            : pluginClassOrUsage.prototype;

        const usage = typeof pluginClassOrUsage === "string"
            ? pluginClassOrUsage
            : descriptionOrUsage;

        const description = typeof pluginClassOrUsage === "string"
            ? descriptionOrUsage
            : _description;

        const cachedSet = Reflect.getMetadata(hindenburgChatCommandKey, actualTarget);
        const chatCommands = cachedSet || new Set;
        if (!cachedSet) {
            Reflect.defineMetadata(hindenburgChatCommandKey, chatCommands, actualTarget);
        }

        chatCommands.add({
            usage,
            description,
            handler: descriptor.value
        });
    };
}
