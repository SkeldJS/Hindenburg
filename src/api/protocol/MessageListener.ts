import { Deserializable, GetSerialized } from "@skeldjs/protocol";

export const hindenburgMessageKey = Symbol("hindenburg:message");

export interface MessageListenerOptions {
    override: boolean;
}

export function MessageListener<T extends Deserializable>(messageClass: T, options: Partial<MessageListenerOptions>) {
    return function (
        target: any,
        propertyKey: string,
        descriptor: TypedPropertyDescriptor<
            (ev: GetSerialized<T>) => any
        >
    ) {
        const allOptions = {
            override: true,
            ...options
        };
        Reflect.defineMetadata(hindenburgMessageKey, [ messageClass, allOptions ], target, propertyKey);
    }
}