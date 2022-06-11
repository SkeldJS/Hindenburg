import "reflect-metadata";

import { Plugin, PluginMetadata } from "../../handlers";
import { ClassDecorator } from "../types";

export interface DeclaredPlugin {
    new(...args: any[]): Plugin;
}

const hindenburgPluginKey = Symbol("hindenburg:plugin");
const hindenburgPreventLoad = Symbol("hindenburg:preventload");

/**
 * A decorator to declare a class as being a Hindenburg Plugin. The class must extend
 * either {@link WorkerPlugin} or {@link RoomPlugin} to be successfully loaded. The
 * version and ordering of your plugin will be taken from your plugin's package.json.
 * @param id The id of your plugin, must begin with "hbplugin-".
 * @example
 * ```ts
 * .@HindenburgPlugin("hbplugin-fun-things")
 * export class FunThingsPlugin extends WorkerPlugin {
 *
 * }
 * ```
 */
export function HindenburgPlugin(id: string): ClassDecorator;
/**
 * A decorator to declare a class as being a Hindenburg Plugin. The class must extend
 * either {@link WorkerPlugin} or {@link RoomPlugin} to be successfully loaded. The
 * version and ordering of your plugin will be taken from your plugin's package.json.
 * @param id The id of your plugin, must begin with "hbplugin-".
 * @param version The version of your plugin. Note that this is superfluous and as of
 * recent Hindenburg versions, can instead be taken from your plugin's package.json.
 * @param loadOrder The ordering that your plugin should be loaded in. Replaced by
 * package.json: "plugin.loadOrder".
 * @param defaultConfig The default configuration for your plugin. Replaced by
 * package.json: "plugin.defaultConfig".
 * @deprecated
 * ```
 */
export function HindenburgPlugin(id: string, version: string, loadOrder?: "first"|"none"|"last"|number, defaultConfig?: any): ClassDecorator;
export function HindenburgPlugin(id: string, version?: string, loadOrder?: "first"|"none"|"last"|number, defaultConfig?: any): ClassDecorator {
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
