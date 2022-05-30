import { Deserializable, GetSerialized } from "@skeldjs/protocol";
import { PacketContext } from "../../worker";
import { Plugin, RoomPlugin, WorkerPlugin } from "../../handlers/PluginLoader";
import { Serializable } from "child_process";

const hindenburgMessageHandlersKey = Symbol("hindenburg:message");

export interface MessageHandlerOptions {
    override: boolean;
}

export type MessageHandlerCallback<Packet extends Serializable> = (
    message: Packet,
    ctx: PacketContext
) => any;

export type MessageHandlerCallbackOriginalListeners<T extends Serializable> = (
    message: T,
    ctx: PacketContext,
    originalListeners: MessageHandlerCallback<T>[]
) => any;

export interface PluginRegisteredMessageHandlerInfo {
    messageClass: Deserializable;
    options: MessageHandlerOptions;
    handler: MessageHandlerCallback<Deserializable>;
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
