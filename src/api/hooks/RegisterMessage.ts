import { Deserializable } from "@skeldjs/protocol";
import { SomePluginCtr } from "../../handlers";
import { ClassDecorator } from "../types";

const hindenburgRegisterMessageKey = Symbol("hindenburg:registermessage");

export function RegisterMessage<T extends Deserializable>(deserializable: T): ClassDecorator;
export function RegisterMessage<T extends Deserializable>(deserializable: T[]): ClassDecorator;
export function RegisterMessage<T extends Deserializable>(deserializable: T|T[]) {
    return function (target: any) {
        const cachedSet: Deserializable[]|undefined = Reflect.getMetadata(hindenburgRegisterMessageKey, target);
        const messagesToRegister = cachedSet || [];
        if (!cachedSet) {
            Reflect.defineMetadata(hindenburgRegisterMessageKey, messagesToRegister, target);
        }

        if (Array.isArray(deserializable)) {
            messagesToRegister.push(...deserializable);
        } else {
            messagesToRegister.push(deserializable);
        }
    };
}

export function getPluginRegisteredMessages(pluginCtr: SomePluginCtr): Deserializable[] {
    return Reflect.getMetadata(hindenburgRegisterMessageKey, pluginCtr) || [];
}
