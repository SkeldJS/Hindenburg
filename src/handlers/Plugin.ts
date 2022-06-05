import chalk from "chalk";

import { Networkable, NetworkableEvents, PlayerData } from "@skeldjs/core";
import { RpcMessage } from "@skeldjs/protocol";

import { Logger } from "../logger";
import { Room, Worker } from "../worker";
import { BaseReactorRpcMessage } from "../api";
import { ReactorRpcMessage } from "../packets";
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
async function _sendReactorRpc(this: Plugin, component: Networkable<unknown, NetworkableEvents, Room>, rpc: BaseReactorRpcMessage, player: PlayerData) {
    const playerConnection = component.room.connections.get(player.clientId);

    if (playerConnection) {
        const targetMod = playerConnection.mods.get(rpc.modId);

        if (!targetMod)
            return;

        await player.room.broadcast([
            new RpcMessage(
                component.netId,
                new ReactorRpcMessage(
                    targetMod.netId,
                    rpc
                )
            )
        ], undefined, [ player ]);
    }
}

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
     * Send a reactor rpc from a component to a room or to a specific player.
     * @param component The component that the rpc should be sent from.
     * @param rpc The reactor rpc to send.
     * @param target Player to send
     * @returns Returns an empty promise.
     * @throws If the reactor rpc is invalid.
     */
    async sendReactorRpc(component: Networkable<unknown, NetworkableEvents, Room>, rpc: BaseReactorRpcMessage, targets?: PlayerData[]): Promise<void> {
        if (!rpc.modId)
            throw new TypeError("Bad reactor rpc: expected modId property.");

        if (typeof component.room.worker.config.reactor !== "boolean") {
            const modConfig = component.room.worker.config.reactor.mods[rpc.modId];
            if (typeof modConfig === "object") {
                if (modConfig.doNetworking === false) { // doNetworking can be undefined and is defaulted to true
                    return;
                }
            }
        }

        const sendReactorRpc = _sendReactorRpc.bind(this);

        const promises = [];

        if (targets) {
            for (const target of targets) {
                promises.push(sendReactorRpc(component, rpc, target));
            }
        }

        for (const [ , player ] of component.room.players) {
            promises.push(sendReactorRpc(component, rpc, player));
        }

        await Promise.all(promises);
    }

    getDependency(pluginId: string): Plugin;
    getDependency<K extends typeof Plugin>(plugin: K): WorkerPlugin|RoomPlugin;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    getDependency(plugin: any): Plugin {
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

    getDependency(pluginId: string): RoomPlugin;
    getDependency<K extends typeof RoomPlugin>(plugin: K): PluginInstanceType<K>
    getDependency(plugin: typeof RoomPlugin|string): RoomPlugin {
        if (typeof plugin !== "string")
            return this.getDependency(plugin.meta.id);

        return this.room.loadedPlugins.get(plugin)!.pluginInstance;
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

    getDependency(pluginId: string): WorkerPlugin;
    getDependency<K extends typeof WorkerPlugin>(plugin: K): PluginInstanceType<K>
    getDependency(plugin: typeof WorkerPlugin|string): WorkerPlugin {
        if (typeof plugin !== "string")
            return this.getDependency(plugin.meta.id);

        return this.worker.loadedPlugins.get(plugin)!.pluginInstance;
    }
}

export type SomePluginCtr = typeof WorkerPlugin|typeof RoomPlugin;
