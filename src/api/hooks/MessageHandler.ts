import { Deserializable, GetSerialized } from "@skeldjs/protocol";

export const hindenburgMessageHandlersKey = Symbol("hindenburg:message");

export interface MessageListenerOptions {
    override: boolean;
}

export function MessageHandler<T extends Deserializable>(messageClass: T, options: Partial<MessageListenerOptions>):
    (
        target: any,
        propertyKey: string,
        descriptor: TypedPropertyDescriptor<
            (ev: GetSerialized<T>) => any
        >
    ) => any;
export function MessageHandler<T extends Deserializable>(pluginClass: typeof Plugin, messageClass: T, options: Partial<MessageListenerOptions>):
    (
        target: any,
        propertyKey: string,
        descriptor: TypedPropertyDescriptor<
            (ev: GetSerialized<T>) => any
        >
    ) => any;
export function MessageHandler<T extends Deserializable>(pluginClassOrMessageClass: typeof Plugin|T, messageClassOrOptions: T|Partial<MessageListenerOptions>, _options?: Partial<MessageListenerOptions>) {
    return function (
        target: any,
        propertyKey: string,
        descriptor: TypedPropertyDescriptor<
            (ev: GetSerialized<T>) => any
        >
    ) {
        const actualTarget = _options
            ? pluginClassOrMessageClass.prototype
            : target;

        const messageClass = _options
            ? messageClassOrOptions
            : pluginClassOrMessageClass;

        const options = _options || messageClassOrOptions;

        const cachedSet = Reflect.getMetadata(hindenburgMessageHandlersKey, actualTarget);
        const messageHandlers = cachedSet || new Set;
        if (!cachedSet) {
            Reflect.defineMetadata(hindenburgMessageHandlersKey, messageHandlers, actualTarget);
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