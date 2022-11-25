import chalk from "chalk";

import { Logger } from "../logger";
import { Room, Worker } from "../worker";
import { fmtCode } from "../util/fmtCode";
import { PluginPackageJson } from "./PluginLoader";

/**
 * Metadata about a plugin, created with {@link HindenburgPlugin}.
 */
export interface PluginMetadata {
    /**
     * The ID of the plugin, beginning with `hbplugin-`.
     *
     * @example "hbplugin-my-plugin"
     */
    id: string;
    /**
     * The version of the plugin.
     * @example "1.0.0"
     * @example "2.0.0-beta.1"
     */
    version: string;
    /**
     * The order that the plugin should be loaded into, where:
     * First = -1
     * None = 0
     * Last = 1
     *
     * Or you can provide a number to provide your own priority.
     *
     * @example "first"
     * @example 9999999999999
     * @example -9999999999999
     */
    loadOrder: "first"|"none"|"last"|number;
    /**
     * The default configuration values for the plugin.
     * @example
     * ```json
     * {
     *   "redis": {
     *     "host": "127.0.0.1",
     *     "port": "6379",
     *     "password": "H1nd3nburgR0cks"
     *   }
     * }
     * ```
     */
    defaultConfig: any;
}

// this function can't be private on Plugin because HindenburgPlugin starts crying.


export type PluginInstanceType<K extends typeof WorkerPlugin|typeof RoomPlugin> = K extends { createInstance(...args: any[]): infer X }
    ? X
    : never;

/**
 * Represents a base plugin for Hindenburg. Should not be extended directly,
 * see {@link WorkerPlugin} and {@link RoomPlugin} to choose the scope of the
 * plugin.
 *
 * Needs to be decorated with {@link HindenburgPlugin} to actually be able to
 * be imported and loaded.
 */
export abstract class Plugin {
    /**
     * The metadata for the plugin, as passed into {@link HindenburgPlugin}.
     */
    static meta: PluginMetadata;

    /**
     * The base directory of the plugin.
     */
    static baseDirectory: string;

    /**
     * The package.json of this plugin.
     */
    static packageJson: PluginPackageJson;

    /**
     * The metadata for the plugin, as passed into {@link HindenburgPlugin}.
     */
    meta!: PluginMetadata;

    /**
     * A console logger for the plugin.
     */
    logger!: Logger;

    /**
     * The directory of the plugin.
     */
    baseDirectory!: string;

    /**
     * The package.json associated with this plugin.
     */
    packageJson!: PluginPackageJson;

    protected constructor(
        /**
         * The config passed into this plugin, usually by the `config.json` on the
         * server.
         */
        public config: any
    ) {
        this.meta = (this["constructor"] as typeof Plugin).meta; // typescript hax
        this.baseDirectory = (this["constructor"] as typeof Plugin).baseDirectory;
        this.packageJson = (this["constructor"] as typeof Plugin).packageJson;
    }

    static [Symbol.for("nodejs.util.inspect.custom")]() {
        return chalk.green(this.meta.id) + chalk.grey("@v" + this.meta.version);
    }

    [Symbol.for("nodejs.util.inspect.custom")]() {
        return chalk.green(this.meta.id) + chalk.grey("@v" + this.meta.version);
    }

    /**
     * Asynchronous method that is called when the plugin is first loaded into
     * the worker or a room, useful for connecting to any servers or loading
     * large amounts of data before the plugin can actually be used, as the
     * server will wait for it to finish.
     *
     * @example
     * ```ts
     * .@HindenburgPlugin("hbplugin-my-plugin")
     * export class MyPlugin extends WorkerPlugin {
     *   async onPluginLoad() {
     *     const res = await fetch("https://icanhazip.com/");
     *     const ip = await res.text();
     *
     *     console.log("My ip is " + ip);
     *   }
     * }
     * ```
     */
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    onPluginLoad(): any {}
    /**
     * Method that is called when the plugin is unloaded from the worker or
     * room, useful for destroying any connections to any servers, clearing up
     * extra event listeners to prevent memory leaks, or closing any server sockets.
     *
     * Not called when the server shuts down, and the server also does not wait
     * for it to finish.
     *
     * @example
     * ```ts
     * .@HindenburgPlugin("hbplugin-my-plugin")
     * export class MyPlugin extends WorkerPlugin {
     *   async onPluginUnload() {
     *     this.logger.info("Closing socket..");
     *     await this.socket.close();
     *     this.logger.info("Closed socket");
     *   }
     * }
     * ```
     */
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    onPluginUnload(): any {}

    /**
     * Method that is called when the plugin's config updates. You can use this
     * to verify configuration, or just to do something such as switch ports or
     * change authentication when the config changes.
     */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/no-empty-function
    onConfigUpdate(oldConfig: any, newConfig: any): any {}

    /**
     * Get a plugin
     * @param pluginId
     */
    getDependencyUnsafe(pluginId: string): Plugin;
    getDependencyUnsafe<K extends typeof Plugin>(plugin: K): WorkerPlugin|RoomPlugin;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    getDependencyUnsafe(plugin: any): Plugin {
        throw new Error("Method not implemented");
    }
}

export class RoomPlugin extends Plugin {
    /**
     * The worker of the room that this plugin is loaded into.
     */
    public readonly worker: Worker;

    /**
     * Create a new instance of this plugin.
     * @param room The room that this plugin is for.
     * @param config Configuration for the plugin.
     */
    static createInstance(room: Room, config: any) {
        const plugin = new this(room, config);
        return plugin;
    }

    /**
     * @example
     * ```ts
     * .@HindenburgPlugin("hbplugin-my-plugin")
     * export class MyPlugin extends RoomPlugin {
     *
     * }
     * ```
     */
    protected constructor(
        /**
         * The room that this plugin is loaded into.
         */
        public readonly room: Room,
        public config: any
    ) {
        super(config);

        this.worker = room.worker;
        this.logger = new Logger(() => `${chalk.yellow(fmtCode(this.room.code))} ${this.meta.id}`, this.worker.vorpal);
    }

    getDependencyUnsafe(pluginId: string): WorkerPlugin|RoomPlugin;
    getDependencyUnsafe(pluginId: string, location: "worker"): WorkerPlugin;
    getDependencyUnsafe(pluginId: string, location: "room"): RoomPlugin;
    getDependencyUnsafe<K extends SomePluginCtr>(plugin: K): PluginInstanceType<K>
    getDependencyUnsafe(pluginId: SomePluginCtr|string, location?: "worker"|"room"): WorkerPlugin|RoomPlugin;
    getDependencyUnsafe(pluginId: SomePluginCtr|string, location?: "worker"|"room"): WorkerPlugin|RoomPlugin {
        if (typeof pluginId !== "string")
            return this.getDependencyUnsafe(pluginId.meta.id);

        if (location === "worker") {
            return this.worker.loadedPlugins.get(pluginId)!.pluginInstance;
        }

        if (location === "room") {
            return this.room.loadedPlugins.get(pluginId)!.pluginInstance;
        }

        return this.getDependencyUnsafe(pluginId, "room") || this.getDependencyUnsafe(pluginId, "worker");
    }

    assertDependency(pluginId: string): WorkerPlugin|RoomPlugin;
    assertDependency(pluginId: string, location: "worker"): WorkerPlugin;
    assertDependency(pluginId: string, location: "room"): RoomPlugin;
    assertDependency<K extends SomePluginCtr>(plugin: K): PluginInstanceType<K>
    assertDependency(pluginId: SomePluginCtr|string, location?: "worker"|"room"): WorkerPlugin|RoomPlugin {
        const possibleDependency = this.getDependencyUnsafe(pluginId, location);

        if (!possibleDependency)
            throw new Error("Tried to get depenency " + (typeof pluginId === "string" ? pluginId : pluginId.meta.id) + " but it was either not loaded or non-existent");

        return possibleDependency;
    }
}

export class WorkerPlugin extends Plugin {
    /**
     * Create a new instance of this plugin.
     * @param worker The Hindenburg worker that this plugin is for.
     * @param config Configuration for the plugin.
     */
    static createInstance(worker: Worker, config: any) {
        const plugin = new this(worker, config);
        return plugin;
    }

    /**
     * @example
     * ```ts
     * .@HindenburgPlugin("hbplugin-my-plugin")
     * export class MyPlugin extends WorkerPlugin {
     *
     * }
     * ```
     */
    protected constructor(
        /**
         * The worker that this plugin is loaded into.
         */
        public readonly worker: Worker,
        public config: any
    ) {
        super(config);

        this.logger = new Logger(() => this.meta.id, this.worker.vorpal);
    }


    getDependencyUnsafe(pluginId: string): WorkerPlugin;
    getDependencyUnsafe<K extends typeof WorkerPlugin>(plugin: K): PluginInstanceType<K>;
    getDependencyUnsafe(pluginId: typeof WorkerPlugin|string): WorkerPlugin;
    getDependencyUnsafe(pluginId: typeof WorkerPlugin|string): WorkerPlugin {
        if (typeof pluginId !== "string")
            return this.getDependencyUnsafe(pluginId.meta.id);

        return this.worker.loadedPlugins.get(pluginId)!.pluginInstance;
    }

    assertDependency(pluginId: string): WorkerPlugin;
    assertDependency<K extends typeof WorkerPlugin>(plugin: K): PluginInstanceType<K>;
    assertDependency(pluginId: typeof WorkerPlugin|string): WorkerPlugin {
        const possibleDependency = this.getDependencyUnsafe(pluginId);

        if (!possibleDependency)
            throw new Error("Tried to get depenency " + (typeof pluginId === "string" ? pluginId : pluginId.meta.id) + " but it was either not loaded or non-existent");

        return possibleDependency;
    }
}

export type SomePluginCtr = typeof WorkerPlugin|typeof RoomPlugin;
