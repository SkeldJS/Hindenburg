import "reflect-metadata";
import { Plugin, PluginMeta } from "../handlers/PluginLoader";

export interface DeclaredPlugin {
    new(...args: any[]): Plugin
}

const hindenburgPluginKey = Symbol("hindenburg:plugin");

export function HindenburgPlugin(meta: Partial<PluginMeta>) {
    if (!meta.id) {
        throw new TypeError("Expected 'id' for plugin metadata.");
    }

    if (typeof meta.id !== "string") {
        throw new TypeError("Expected 'id' to be a string in reverse domain name notation (com.example.myplugin).");
    }

    const actualMeta: PluginMeta = {
        id: "",
        version: "1.0.0",
        defaultConfig: {},
        order: "none",
        ...meta
    };

    return function<T extends DeclaredPlugin>(constructor: T) {
        Reflect.defineMetadata(hindenburgPluginKey, true, constructor);

        return class extends constructor {
            static meta = actualMeta;
            meta = actualMeta;
        };
    };
}

export function isHindenburgPlugin(object: any)  {
    return Reflect.hasMetadata(hindenburgPluginKey, object);
}
