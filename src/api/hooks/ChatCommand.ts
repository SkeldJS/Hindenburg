import { ChatCommandCallback } from "../../handlers/CommandHander";

export const hindenburgChatCommandKey = Symbol("hindenburg:chatcommand");
export const hindenburgChatCommandDescKey = Symbol("hindenburg:chatcommand_description");

export function ChatCommand(usage: string, description: string) {
    return function(
        target: any,
        propertyKey: string,
        descriptor: TypedPropertyDescriptor<ChatCommandCallback>
    ) {
        Reflect.defineMetadata(hindenburgChatCommandKey, usage, target, propertyKey);
        Reflect.defineMetadata(hindenburgChatCommandDescKey, description, target, propertyKey);
    }
}