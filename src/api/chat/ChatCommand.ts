import { ChatCommandCallback } from "./CommandHander";

export const hindenburgChatCommandKey = Symbol("hindenburg:chatcommand");

export function ChatCommand(usage: string) {
    return function(
        target: any,
        propertyKey: string,
        descriptor: TypedPropertyDescriptor<ChatCommandCallback>
    ) {
        Reflect.defineMetadata(hindenburgChatCommandKey, usage, target, propertyKey);
    }
}