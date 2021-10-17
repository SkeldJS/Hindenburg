import { Deserializable } from "@skeldjs/protocol";
import { WorkerPlugin, RoomPlugin } from "../../handlers";

const hindenburgRegisterMessageKey = Symbol("hindenburg:registermessage");

export function RegisterMessage<T extends Deserializable>(deserializable: T) {
    return function (target: any) {
        const cachedSet: Deserializable[]|undefined = Reflect.getMetadata(hindenburgRegisterMessageKey, target);
        const messagesToRegister = cachedSet || [];
        if (!cachedSet) {
            Reflect.defineMetadata(hindenburgRegisterMessageKey, messagesToRegister, target);
        }

        messagesToRegister.push(deserializable);
    };
}

export function getPluginRegisteredMessages(pluginCtr: typeof WorkerPlugin|typeof RoomPlugin): Deserializable[] {
    return Reflect.getMetadata(hindenburgRegisterMessageKey, pluginCtr) || [];
}
