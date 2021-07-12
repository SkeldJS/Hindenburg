import { Plugin, PluginMeta } from "../handlers/PluginHandler";

export interface DeclaredPlugin {
    new(...args: any[]): Plugin
}

export function HindenburgPlugin(meta: PluginMeta & { version: undefined|string }) {
    return function<T extends DeclaredPlugin>(constructor: T) {
        return class extends constructor {
            static id = meta.id;

            meta: PluginMeta;

            constructor(...args: any) {
                super(...args);

                this.meta = meta;
            }
        }
    }
}