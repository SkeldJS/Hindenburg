import { Deserializable, GetSerialized } from "@skeldjs/protocol";

export const hindenburgMessageHandlersKey = Symbol("hindenburg:message");

export interface MessageListenerOptions {
    override: boolean;
}

export function MessageHandler<T extends Deserializable>(messageClass: T, options: Partial<MessageListenerOptions>) {
    return function (
        target: any,
        propertyKey: string,
        descriptor: TypedPropertyDescriptor<
            (ev: GetSerialized<T>) => any
        >
    ) {
        const cachedSet = Reflect.getMetadata(hindenburgMessageHandlersKey, target);
        const messageHandlers = cachedSet || new Set;
        if (!cachedSet) {
            Reflect.defineMetadata(hindenburgMessageHandlersKey, messageHandlers, target);
        }
        
        Reflect.defineMetadata(hindenburgMessageHandlersKey, {
            messageClass,
            handler: descriptor.value,
            options: {
                override: false,
                ...options
            }
        }, target, propertyKey);
    };
}