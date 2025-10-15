import { NetworkedObject, NetworkedObjectConstructor } from "@skeldjs/core";
import { SomePluginCtr } from "../../handlers";
import { ClassDecorator } from "../types";
import { Room } from "../../Room";

const waterwayRegisterPrefab = Symbol("waterway:registerprefab");

export interface RegisteredPrefab {
    spawnType: number;
    components: NetworkedObjectConstructor<NetworkedObject<Room>>[];
}

export function RegisterPrefab(spawnType: number, components: NetworkedObjectConstructor<NetworkedObject<Room>>[]): ClassDecorator {
    return function (target: any) {
        const cachedSet: RegisteredPrefab[] | undefined = Reflect.getMetadata(waterwayRegisterPrefab, target);
        const prefabsToRegister = cachedSet || [];
        if (!cachedSet) {
            Reflect.defineMetadata(waterwayRegisterPrefab, prefabsToRegister, target);
        }

        prefabsToRegister.push({
            spawnType,
            components
        });
    };
}

export function getPluginRegisteredPrefabs(pluginCtr: SomePluginCtr): RegisteredPrefab[] {
    return Reflect.getMetadata(waterwayRegisterPrefab, pluginCtr) || [];
}
