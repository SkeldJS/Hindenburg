import { Deserializable, GetSerialized } from "@skeldjs/protocol";
import { PacketContext } from "../../Worker";
import { Plugin, RoomPlugin, WorkerPlugin } from "../../handlers/PluginLoader";

const hindenburgMessageHandlersKey = Symbol("hindenburg:message");

export interface MessageHandlerOptions {
    override: boolean;
}

export type MessageHandlerCallback<T extends Deserializable> = (
    ev: GetSerialized<T>,
    ctx: PacketContext
) => any


export interface PluginRegisteredMessageHandlerInfo {
    messageClass: Deserializable;
    options: MessageHandlerOptions;
    handler: MessageHandlerCallback<Deserializable>;
}

export function MessageHandler<T extends Deserializable>(messageClass: T, options?: Partial<MessageHandlerOptions>):
    (
        target: any,
        propertyKey: string,
        descriptor: TypedPropertyDescriptor<MessageHandlerCallback<T>>
    ) => any;
export function MessageHandler<T extends Deserializable>(pluginClass: typeof WorkerPlugin|typeof RoomPlugin, messageClass: T, options: Partial<MessageHandlerOptions>):
    (
        target: any,
        propertyKey: string,
        descriptor: TypedPropertyDescriptor<MessageHandlerCallback<T>>
    ) => any;
export function MessageHandler<T extends Deserializable>(pluginClassOrMessageClass: typeof WorkerPlugin|typeof RoomPlugin|T, messageClassOrOptions: T|Partial<MessageHandlerOptions>, _options?: Partial<MessageHandlerOptions>) {
    return function (
        target: any,
        propertyKey: string,
        descriptor: TypedPropertyDescriptor<MessageHandlerCallback<T>>
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
