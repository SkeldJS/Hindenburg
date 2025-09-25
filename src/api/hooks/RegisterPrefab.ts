import { NetworkedObject, NetworkedObjectConstructor } from "@skeldjs/core";
import { SomePluginCtr } from "../../handlers";
import { ClassDecorator } from "../types";

const hindenburgRegisterPrefab = Symbol("hindenburg:registerprefab");

export interface RegisteredPrefab {
    spawnType: number;
    components: NetworkedObjectConstructor<NetworkedObject>[];
}

export function RegisterPrefab(spawnType: number, components: NetworkedObjectConstructor<NetworkedObject>[]): ClassDecorator {
    return function (target: any) {
        const cachedSet: RegisteredPrefab[] | undefined = Reflect.getMetadata(hindenburgRegisterPrefab, target);
        const prefabsToRegister = cachedSet || [];
        if (!cachedSet) {
            Reflect.defineMetadata(hindenburgRegisterPrefab, prefabsToRegister, target);
        }

        prefabsToRegister.push({
            spawnType,
            components
        });
    };
}

export function getPluginRegisteredPrefabs(pluginCtr: SomePluginCtr): RegisteredPrefab[] {
    return Reflect.getMetadata(hindenburgRegisterPrefab, pluginCtr) || [];
}
