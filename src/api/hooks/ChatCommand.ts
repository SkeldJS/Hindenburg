import { ChatCommandCallback } from "../../handlers/CommandHander";

export const hindenburgChatCommandKey = Symbol("hindenburg:chatcommand");

export function ChatCommand(usage: string, description: string) {
    return function(
        target: any,
        propertyKey: string,
        descriptor: TypedPropertyDescriptor<ChatCommandCallback>
    ) {
        Reflect.defineMetadata(hindenburgChatCommandKey, [ usage, description ], target, propertyKey);
    }
}