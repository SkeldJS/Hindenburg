import { Deserializable, GetSerialized } from "@skeldjs/protocol";
import { PacketContext } from "../../Worker";
import { Plugin } from "../../handlers/PluginLoader";

export const hindenburgMessageHandlersKey = Symbol("hindenburg:message");

export interface MessageListenerOptions {
    override: boolean;
}

export type MessageHandlerCallback<T extends Deserializable> = (
    ev: GetSerialized<T>,
    ctx: PacketContext
) => any

export function MessageHandler<T extends Deserializable>(messageClass: T, options?: Partial<MessageListenerOptions>):
    (
        target: any,
        propertyKey: string,
        descriptor: TypedPropertyDescriptor<MessageHandlerCallback<T>>
    ) => any;
export function MessageHandler<T extends Deserializable>(pluginClass: typeof Plugin, messageClass: T, options: Partial<MessageListenerOptions>):
    (
        target: any,
        propertyKey: string,
        descriptor: TypedPropertyDescriptor<MessageHandlerCallback<T>>
    ) => any;
export function MessageHandler<T extends Deserializable>(pluginClassOrMessageClass: typeof Plugin|T, messageClassOrOptions: T|Partial<MessageListenerOptions>, _options?: Partial<MessageListenerOptions>) {
    return function (
        target: any,
        propertyKey: string,
        descriptor: TypedPropertyDescriptor<MessageHandlerCallback<T>>
    ) {
        const actualTarget = _options
            ? pluginClassOrMessageClass.prototype
            : target;

        const messageClass = _options
            ? messageClassOrOptions
            : pluginClassOrMessageClass;

        const options = _options || messageClassOrOptions || {};

        const cachedSet = Reflect.getMetadata(hindenburgMessageHandlersKey, actualTarget);
        const messageHandlers = cachedSet || new Set;
        if (!cachedSet) {
            Reflect.defineMetadata(hindenburgMessageHandlersKey, messageHandlers, actualTarget);
        }

        messageHandlers.add({
            messageClass,
            options: {
                override: false,
                ...options
            },
            handler: descriptor.value
        });
    };
}