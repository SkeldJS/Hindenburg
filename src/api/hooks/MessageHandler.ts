import { Deserializable, GetSerialized, Serializable } from "@skeldjs/protocol";
import { PacketContext } from "../../worker";
import { Plugin, RoomPlugin, WorkerPlugin } from "../../handlers";

const hindenburgMessageHandlersKey = Symbol("hindenburg:message");

export interface MessageHandlerOptions {
    override: boolean;
}

export type MessageHandlerCallback<Message extends Serializable> = (
    message: Message,
    ctx: PacketContext
) => any;

export type MessageHandlerCallbackOriginalListeners<Message extends Serializable> = (
    message: Message,
    ctx: PacketContext,
    originalListeners: MessageHandlerCallback<Message>[]
) => any;

export interface PluginRegisteredMessageHandlerInfo {
    messageClass: Deserializable;
    options: MessageHandlerOptions;
    handler: MessageHandlerCallbackOriginalListeners<Serializable>;
}

export function MessageHandler<T extends Deserializable>(messageClass: T, options?: Partial<{ override: false }>):
    (target: any, propertyKey: string, descriptor: TypedPropertyDescriptor<MessageHandlerCallback<GetSerialized<T>>>) => any;
export function MessageHandler<T extends Deserializable>(messageClass: T, options: Partial<{ override: true }>):
    (target: any, propertyKey: string, descriptor: TypedPropertyDescriptor<MessageHandlerCallbackOriginalListeners<GetSerialized<T>>>) => any;
export function MessageHandler<T extends Deserializable>(pluginClass: typeof WorkerPlugin|typeof RoomPlugin, messageClass: T, options?: Partial<{ override: false }>):
    (target: any, propertyKey: string, descriptor: TypedPropertyDescriptor<MessageHandlerCallback<GetSerialized<T>>>) => any;
export function MessageHandler<T extends Deserializable>(pluginClass: typeof WorkerPlugin|typeof RoomPlugin, messageClass: T, options: Partial<{ override: true }>):
    (target: any, propertyKey: string, descriptor: TypedPropertyDescriptor<MessageHandlerCallbackOriginalListeners<GetSerialized<T>>>) => any;
export function MessageHandler<T extends Deserializable>(pluginClassOrMessageClass: typeof WorkerPlugin|typeof RoomPlugin|T, messageClassOrOptions: T|Partial<MessageHandlerOptions>, _options?: Partial<MessageHandlerOptions>) {
    return function (
        target: any,
        propertyKey: string,
        descriptor: TypedPropertyDescriptor<any>
    ) {
        if (!descriptor.value)
            return;

        const actualTarget = _options
            ? pluginClassOrMessageClass.prototype
            : target;

        const messageClass = _options
            ? messageClassOrOptions
            : pluginClassOrMessageClass;

        const options = _options || messageClassOrOptions || {};

        const cachedSet: PluginRegisteredMessageHandlerInfo[]|undefined = Reflect.getMetadata(hindenburgMessageHandlersKey, actualTarget);
        const messageHandlers = cachedSet || [];
        if (!cachedSet) {
            Reflect.defineMetadata(hindenburgMessageHandlersKey, messageHandlers, actualTarget);
        }

        messageHandlers.push({
            messageClass: messageClass as T,
            options: {
                override: false,
                ...options
            },
            handler: descriptor.value
        });
    };
}

export function getPluginMessageHandlers(pluginCtr: typeof Plugin|Plugin): PluginRegisteredMessageHandlerInfo[] {
    return Reflect.getMetadata(hindenburgMessageHandlersKey, pluginCtr) || [];
}
