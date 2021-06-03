import { Deserializable } from "@skeldjs/protocol";

export const MessagesToRegister = "HindenburgRegisteredPackets";

export function RegisterMessage<T extends Deserializable>(messageClass: T) {
    return function (target: any) {
        target[MessagesToRegister] ||= new Set;
        target[MessagesToRegister].add(messageClass);
    }
}