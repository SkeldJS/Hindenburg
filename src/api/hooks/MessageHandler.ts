import { Deserializable, GetSerialized, Serializable } from "@skeldjs/protocol";
import { PacketContext } from "../../worker";
import { Plugin, PluginLoader, RoomPlugin, WorkerPlugin } from "../../handlers";
import { MethodDecorator } from "../types";

const hindenburgMessageHandlersKey = Symbol("hindenburg:message");

export enum MessageHandlerAttach {
    Worker,
    Room
}

export interface MessageHandlerOptions {
    override: boolean;
    attachTo: MessageHandlerAttach;
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

export function MessageHandler<T extends Deserializable>(messageClass: T, options?: Partial<{ override: false; attachTo: MessageHandlerAttach; }>): MethodDecorator<MessageHandlerCallback<GetSerialized<T>>>;
export function MessageHandler<T extends Deserializable>(messageClass: T, options: Partial<{ override: true; attachTo: MessageHandlerAttach; }>): MethodDecorator<MessageHandlerCallbackOriginalListeners<GetSerialized<T>>>;
export function MessageHandler<T extends Deserializable>(pluginClass: typeof WorkerPlugin|typeof RoomPlugin, messageClass: T, options?: Partial<{ override: false; attachTo: MessageHandlerAttach; }>): MethodDecorator<MessageHandlerCallback<GetSerialized<T>>>;
export function MessageHandler<T extends Deserializable>(pluginClass: typeof WorkerPlugin|typeof RoomPlugin, messageClass: T, options: Partial<{ override: true; attachTo: MessageHandlerAttach; }>): MethodDecorator<MessageHandlerCallbackOriginalListeners<GetSerialized<T>>>;
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

        const options = (_options || messageClassOrOptions || {}) as Partial<MessageHandlerOptions>;

        const cachedSet: PluginRegisteredMessageHandlerInfo[]|undefined = Reflect.getMetadata(hindenburgMessageHandlersKey, actualTarget);
        const messageHandlers = cachedSet || [];
        if (!cachedSet) {
            Reflect.defineMetadata(hindenburgMessageHandlersKey, messageHandlers, actualTarget);
        }

        const isRoomPlugin = PluginLoader.isRoomPlugin(actualTarget);

        if (isRoomPlugin) {
            if (options.attachTo !== undefined && options.attachTo === MessageHandlerAttach.Worker) {
                throw new Error("Cannot attach message handler to worker on a room plugin");
            }

            options.attachTo = MessageHandlerAttach.Room;
        }

        messageHandlers.push({
            messageClass: messageClass as T,
            options: {
                override: false,
                attachTo: MessageHandlerAttach.Worker,
                ...options
            },
            handler: descriptor.value
        });
    };
}

export function getPluginMessageHandlers(pluginCtr: typeof Plugin|Plugin): PluginRegisteredMessageHandlerInfo[] {
    return Reflect.getMetadata(hindenburgMessageHandlersKey, pluginCtr) || [];
}
