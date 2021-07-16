import { ChatCommandCallback } from "../../handlers/ChatCommandHander";

export const hindenburgChatCommandKey = Symbol("hindenburg:chatcommand");

export function ChatCommand(usage: string, description: string) {
    return function(
        target: any,
        propertyKey: string,
        descriptor: TypedPropertyDescriptor<ChatCommandCallback>
    ) {
        const cachedSet = Reflect.getMetadata(hindenburgChatCommandKey, target);
        const chatCommands = cachedSet || new Set;
        if (!cachedSet) {
            Reflect.defineMetadata(hindenburgChatCommandKey, chatCommands, target);
        }

        chatCommands.add({
            usage,
            handler: descriptor.value,
            description
        });
    }
}