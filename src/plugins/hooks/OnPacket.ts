import { Deserializable, GetSerialized } from "@skeldjs/protocol";

export const PacketHandlers = Symbol("PacketHandlers");
export const RegisteredPackets = Symbol("RegisteredPackets");

export function OnPacket<T extends Deserializable>(messageClass: T) {
    return function (target: any, propertyName: string, descriptor: TypedPropertyDescriptor<(ev: GetSerialized<T>) => any>) {
        target[PacketHandlers] ||= new Map;
        target[RegisteredPackets] ||= new Set;

        let gotListeners: Set<string> = target[PacketHandlers].get(messageClass);

        if (!gotListeners) {
            gotListeners = new Set;
            target[PacketHandlers].set(messageClass, gotListeners);
        }

        target[RegisteredPackets].add(messageClass);
        gotListeners.add(propertyName);
    }
}