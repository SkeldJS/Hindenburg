import "reflect-metadata";

import { hindenburgPluginDirectory, Plugin, PluginMetadata } from "../../handlers";

export interface DeclaredPlugin {
    new(...args: any[]): Plugin;
}

const hindenburgPluginKey = Symbol("hindenburg:plugin");
const hindenburgPreventLoad = Symbol("hindenburg:preventload");

export function HindenburgPlugin(id: string, version?: string, loadOrder?: "first"|"none"|"last"|number, defaultConfig?: any) {
    if (!id) {
        throw new TypeError("Expected 'id' for plugin metadata.");
    }

    if (typeof id !== "string") {
        throw new TypeError("Expected 'id' to be a string in reverse domain name notation (com.example.myplugin).");
    }

    const metadata: PluginMetadata = {
        id,
        version,
        defaultConfig,
        loadOrder
    } as PluginMetadata;

    return function<T extends DeclaredPlugin>(constructor: T) {
        Reflect.defineMetadata(hindenburgPluginKey, true, constructor);

        const hookedClass = class extends constructor {
            static meta = metadata;

            constructor(...args: any) {
                super(...args);

                this.baseDirectory = Reflect.getMetadata(hindenburgPluginDirectory, hookedClass);
            }
        };

        return hookedClass;
    };
}

export function PreventLoad(target: any) {
    Reflect.defineMetadata(hindenburgPreventLoad, 1, target);
}

export function isHindenburgPlugin(object: any)  {
    return Reflect.hasMetadata(hindenburgPluginKey, object);
}

export function shouldPreventLoading(object: any) {
    return Reflect.hasMetadata(hindenburgPreventLoad, object);
}
