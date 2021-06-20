import { Deserializable } from "@skeldjs/protocol";

export const hindenburgRegisterMessageKey = Symbol("hindenburg:registermessage");

export function RegisterMessage<T extends Deserializable>(deserializable: T) {
    return function (target: any) {
        const cachedSet: Set<Deserializable>|undefined = Reflect.getMetadata(hindenburgRegisterMessageKey, target);
        const messagesToRegister = cachedSet || new Set;
        if (!cachedSet) {
            Reflect.defineMetadata(hindenburgRegisterMessageKey, messagesToRegister, target);
        }

        messagesToRegister.add(deserializable);
    }
}