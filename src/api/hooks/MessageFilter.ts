import { Deserializable, GetSerialized, Serializable } from "@skeldjs/protocol";
import { PacketContext, Perspective } from "../../worker";
import { Plugin } from "../../handlers";
import { MethodDecorator } from "../types";

const hindenburgMessageFiltersKey = Symbol("hindenburg:perspective-message-filter");

/**
 * The direction that a message filter for a perspective is going.
 */
export enum MessageFilterDirection {
    /**
     * The message is going _to_ the perspective, either from the main room or
     * another perspective,
     */
    Incoming,
    /**
     * The message is coming _from_ the perspective, to either the main room
     * or another perspective.
     */
    Outgoing
}

export type MessageFilterCallback<Message extends Serializable> = (
    message: Message,
    perspective: Perspective,
    direction: MessageFilterDirection,
    ctx: PacketContext
) => any;

export interface PerspectiveFilterRegisteredMessageFilterInfo {
    messageClass: Deserializable;
    handler: MessageFilterCallback<Serializable>;
}

export function MessageFilter<T extends Deserializable>(messageClass: T): MethodDecorator<MessageFilterCallback<GetSerialized<T>>> {
    return function (
        target: any,
        propertyKey: string,
        descriptor: TypedPropertyDescriptor<any>
    ) {
        if (!descriptor.value)
            return;

        const cachedSet: PerspectiveFilterRegisteredMessageFilterInfo[]|undefined = Reflect.getMetadata(hindenburgMessageFiltersKey, target);
        const messageFilters = cachedSet || [];
        if (!cachedSet) {
            Reflect.defineMetadata(hindenburgMessageFiltersKey, messageFilters, target);
        }

        messageFilters.push({
            messageClass: messageClass as T,
            handler: descriptor.value
        });
    };
}

export function getPerspectiveFilterMessageFilters(pluginCtr: typeof Plugin|Plugin): PerspectiveFilterRegisteredMessageFilterInfo[] {
    return Reflect.getMetadata(hindenburgMessageFiltersKey, pluginCtr) || [];
}
