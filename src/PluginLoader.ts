import "reflect-metadata";
import fs from "fs/promises";
import path from "path";

import { Worker } from "./Worker";
import { hindenburgEventKey } from "./api/events/EventListener";

export interface PluginMeta {
    id: string;
}

export class Plugin {
    static id: string;
    meta!: PluginMeta;

    constructor(
        public readonly worker: Worker,
        public readonly config: any
    ) {}

    async onPluginLoad?(): Promise<void> { return; };
    async onPluginUnload?(): Promise<void> { return; };
}

export class PluginLoader {
    loadedPlugins: Map<string, Plugin>;

    constructor(
        public readonly worker: Worker,
        public readonly pluginDir: string
    ) {
        this.loadedPlugins = new Map; 
    }

    async loadPlugin(importPath: string) {
        const { default: loadedPluginCtr } = await import(importPath) as { default: typeof Plugin };

        if (typeof loadedPluginCtr !== "function")
            throw new Error("Expected default export of plugin class, got " + typeof loadedPluginCtr + ".");

        const config = this.worker.config.plugins[loadedPluginCtr.id] || {};

        if (typeof config === "boolean" && !config)
            throw new Error("Plugin is disabled.");

        const loadedPlugin = new loadedPluginCtr(this.worker, config);
        loadedPlugin.onPluginLoad?.();

        /**
         * Object.getPrototypeOf is done twice as {@link HindenburgPlugin} extends
         * the actual plugin class and the prototype is wrong.
         * @example
         * ```ts
         * class Animal {
         *   constructor(name: string) {
         *     this.name = name;
         *   }
         * 
         *   feed() {
         *     console.log("Fed", this.name);
         *   }
         * }
         * 
         * class Dog extends Animal {
         * 
         * }
         * 
         * const sprout = new Dog("Sprout");
         * const barney = new Animal("Barney");
         * 
         * console.log(Object.getPrototypeOf(sprout)); // {}
         * console.log(Object.getPrototypeOf(barney)); // { feed() {} }
         * 
         * const proto = Object.getPrototype(sprout);
         * console.log(Object.getPrototypeOf(proto)); // { feed() {} }
         * ```
         */
        const pluginPrototype = Object.getPrototypeOf(Object.getPrototypeOf(loadedPlugin));
        const propertyNames = Object.getOwnPropertyNames(pluginPrototype);

        for (const propertyName of propertyNames) {
            const property = pluginPrototype[propertyName] as (...args: any[]) => any;

            if (typeof property !== "function")
                continue;

            const eventName = Reflect.getMetadata(hindenburgEventKey, loadedPlugin, propertyName);
            
            if (eventName) {
                this.worker.on(eventName, property.bind(loadedPlugin));
            }
        }

        return loadedPlugin;
    }

    async loadFromDirectory() {
        const allImportNames = [];
        try {
            const packageJson = await fs.readFile(path.join(this.pluginDir, "package.json"), "utf8");
            const json = JSON.parse(packageJson) as { dependencies: Record<string, string> };

            for (const depenencyName in json.dependencies) {
                allImportNames.push(depenencyName);
            }
        } catch (e) {
            if (e.code === "ENOENT") {
                return;
            }
            throw e;
        }

        const files = await fs.readdir(this.pluginDir);
        for (const file of files) {
            if (!file.startsWith("hbplugin-"))
                continue;
            
            allImportNames.push(file);
        }

        for (const importName of allImportNames) {
            try {
                const importPath = path.join(this.pluginDir, importName);
                const loadedPlugin = await this.loadPlugin(importPath);
                this.worker.logger.info("Loaded plugin %s.", loadedPlugin.meta.id);
            } catch (e) {
                this.worker.logger.warn("Failed to load plugin %s: %s", importName, e);
            }
        }
    }
}