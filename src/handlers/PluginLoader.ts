import "reflect-metadata";

import { Deserializable, RpcMessage } from "@skeldjs/protocol";
import { AirshipStatus, AprilShipStatus, CustomNetworkTransform, GameData, LobbyBehaviour, MeetingHud, MiraShipStatus, Networkable, NetworkableEvents, PlayerControl, PlayerData, PlayerPhysics, PolusShipStatus, SkeldShipStatus, SpawnType, VoteBanSystem } from "@skeldjs/core";

import path from "path";
import fs from "fs/promises";

import vorpal from "vorpal";
import resolvePkg from "resolve-pkg";
import chalk from "chalk";

import { Worker, WorkerEvents } from "../Worker";
import { RoomEvents } from "../BaseRoom";
import { Room } from "../Room";

import {
    getPluginChatCommands,
    getPluginCliCommands,
    getPluginEventListeners,
    getPluginMessageHandlers,
    getPluginReactorRpcHandlers,
    getPluginRegisteredMessages,
    isHindenburgPlugin,
    BaseReactorRpcMessage,
    MessageHandlerOptions,
    shouldPreventLoading,
    RegisteredPrefab,
    getPluginRegisteredPrefabs
} from "../api";

import { recursiveClone } from "../util/recursiveClone";
import { recursiveAssign } from "../util/recursiveAssign";

import { ReactorRpcMessage } from "../packets";
import { Logger } from "../logger";
import { fmtCode } from "../util/fmtCode";

export const hindenburgPluginDirectory = Symbol("hindenburg:plugindirectory");

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
    order: "first"|"none"|"last"|number;
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
        ], true, player);
    }
}

/**
 * Represents a base plugin for Hindenburg. Should not be extended directly,
 * see {@link WorkerPlugin} and {@link RoomPlugin} to choose the scope of the
 * plugin.
 *
 * Needs to be decorated with {@link HindenburgPlugin} to actually be able to
 * be imported and loaded.
 */
export class Plugin {
    /**
     * The metadata for the plugin, as passed into {@link HindenburgPlugin}.
     */
    static meta: PluginMetadata;

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
     * All chat commands that were loaded into the room, created with {@link ChatCommand}.
     */
    loadedChatCommands: string[];
    /**
     * All CLI commands that were loaded into the worker, created with {@link CliCommand}.
     */
    loadedCliCommands: vorpal.Command[];
    /**
     * All event listeners that were loaded into the worker, created with {@link EventListener}.
     */
    loadedEventListeners: {
        eventName: string;
        handler: (...args: any) => any;
    }[];
    /**
     * All protocol message handlers that were loaded into the worker, created with
     * {@link MessageHandler}.
     */
    loadedMessageHandlers: {
        messageCtr: Deserializable;
        options: MessageHandlerOptions;
        handler: (...args: any) => any;
    }[];
    /**
     * All reactor rpc message handlers that were loaded into the worker, created with
     * {@link ReactorRpcHandler}.
     */
    loadedReactorRpcHandlers: {
        reactorRpc: typeof BaseReactorRpcMessage,
        handler: (component: Networkable, rpc: BaseReactorRpcMessage) => any
    }[];
    /**
     * All protocol messages that were registered into the worker, created with
     * {@link RegisterMessage}.
     */
    loadedRegisteredMessages: Deserializable[];

    /**
     * All registered spawn prefabs for the plugin, created with {@link RegisterPrefab}.
     */
    registeredPrefabs: RegisteredPrefab[]

    constructor(
        /**
         * The config passed into this plugin, usually by the `config.json` on the
         * server.
         */
        public config: any
    ) {
        this.loadedChatCommands = [];
        this.loadedCliCommands = [];
        this.loadedEventListeners = [];
        this.loadedMessageHandlers = [];
        this.loadedReactorRpcHandlers = [];
        this.loadedRegisteredMessages = [];
        this.registeredPrefabs = [];
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
     * .@HindenburgPlugin("hbplugin-my-plugin", "1.0.0", "none")
     * export default class extends WorkerPlugin {
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
     * .@HindenburgPlugin("hbplugin-my-plugin", "1.0.0", "none")
     * export default class extends WorkerPlugin {
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
}

export class RoomPlugin extends Plugin {
    /**
     * The worker of the room that this plugin is loaded into.
     */
    public readonly worker: Worker;

    /**
     * @example
     * ```ts
     * .@HindenburgPlugin("hbplugin-my-plugin", "1.0.0", "none")
     * export default class extends RoomPlugin {
     *
     * }
     * ```
     */
    constructor(
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
}

export class WorkerPlugin extends Plugin {
    /**
     * @example
     * ```ts
     * .@HindenburgPlugin("hbplugin-my-plugin", "1.0.0", "none")
     * export default class extends WorkerPlugin {
     *
     * }
     * ```
     */
    constructor(
        /**
         * The worker that this plugin is loaded into.
         */
        public readonly worker: Worker,
        public config: any
    ) {
        super(config);

        this.logger = new Logger(() => this.meta.id, this.worker.vorpal);
    }
}

/**
 * Service for the worker node to import plugins & load them globally or into
 * specific rooms.
 *
 * An "imported plugin" is a plugin which has actually been loaded into memory
 * with require(), and a "loaded plugin" is a plugin which is enabled on a room
 * or globally.
 */
export class PluginLoader {
    /**
     * All imported worker plugins ready to be loaded lobally.
     */
    workerPlugins: Map<string, typeof WorkerPlugin>;

    /**
     * All imported room plugins ready to be loaded onto a room.
     */
    roomPlugins: Map<string, typeof RoomPlugin>;

    /**
     * Create a plugin loader. Note that the worker instantiates one itself, see
     * {@link Worker.pluginLoader}.
     * @param worker The worker that the plugin loader is for.
     * @param pluginDirectories The base directory for installed plugins.
     * @example
     * ```ts
     * const pluginLoader = new PluginLoader(this.worker, "/home/user/hindenburg/plugins");
     * ```
     */
    constructor(
        /**
         * The worker that this plugin loader is for.
         */
        public readonly worker: Worker,
        /**
         * The base directory for installed plugins.
         */
        public readonly pluginDirectories: string[]
    ) {
        this.workerPlugins = new Map;
        this.roomPlugins = new Map;
    }

    /**
     * Check whether some object is that of a Hindenburg plugin, created with
     * the {@link HindenburgPlugin} decorator.
     * @param someObject The object to check.
     * @returns Whether {@link someObject} is a Hindenburg plugin.
     *
     * @example
     * ```ts
     * console.log(this.worker.pluginLoader.isHindenburgPlugin({})); // false
     * ```
     *
     * @example
     * ```ts
     * .@HindenburgPlugin("hbplugin-my-plugin", "1.0.0", "none")
     * class MyPlugin extends WorkerPlugin {}
     *
     * console.log(this.worker.pluginLoader.isHindenburgPlugin(MyPlugin)); // true
     * ```
     */
    static isHindenburgPlugin(someObject: any) {
        return isHindenburgPlugin(someObject);
    }

    /**
     * Check whether an imported Hindenburg plugin is a worker plugin to be loaded
     * globally, extending {@link WorkerPlugin}.
     * @param pluginCtr The plugin to check.
     * @returns Whether {@link pluginCtr} is a global worker plugin.
     *
     * @example
     * ```ts
     * .@HindenburgPlugin("hbplugin-my-plugin", "1.0.0", "none")
     * class MyPlugin extends RoomPlugin {}
     *
     * console.log(this.worker.pluginLoad.isWorkerPlugin(MyPlugin)); // false
     * ```
     *
     * @example
     * ```ts
     * .@HindenburgPlugin("hbplugin-my-plugin", "1.0.0", "none")
     * class MyPlugin extends WorkerPlugin {}
     *
     * console.log(this.worker.pluginLoad.isWorkerPlugin(MyPlugin)); // true
     * ```
     */
    static isWorkerPlugin(pluginCtr: typeof WorkerPlugin|typeof RoomPlugin): pluginCtr is typeof WorkerPlugin {
        let currentCtr: typeof WorkerPlugin|typeof RoomPlugin = pluginCtr;
        while (currentCtr !== null) {
            currentCtr = Object.getPrototypeOf(currentCtr);

            if (currentCtr === WorkerPlugin)
                return true;
        }
        return false;
    }

    /**
     * Check whether an imported Hindenburg plugin is a room plugin to be loaded
     * into rooms, extending {@link RoomPlugin}.
     * @param pluginCtr The plugin to check.
     * @returns Whether {@link pluginCtr} is a room plugin.
     *
     * @example
     * ```ts
     * .@HindenburgPlugin("hbplugin-my-plugin", "1.0.0", "none")
     * class MyPlugin extends RoomPlugin {}
     *
     * console.log(this.worker.pluginLoad.isRoomPlugin(MyPlugin)); // true
     * ```
     *
     * @example
     * ```ts
     * .@HindenburgPlugin("hbplugin-my-plugin", "1.0.0", "none")
     * class MyPlugin extends WorkerPlugin {}
     *
     * console.log(this.worker.pluginLoad.isRoomPlugin(MyPlugin)); // false
     * ```
     */
    static isRoomPlugin(pluginCtr: typeof WorkerPlugin|typeof RoomPlugin): pluginCtr is typeof RoomPlugin {
        let currentCtr: typeof WorkerPlugin|typeof RoomPlugin = pluginCtr;
        while (currentCtr !== null) {
            currentCtr = Object.getPrototypeOf(currentCtr);

            if (currentCtr === RoomPlugin)
                return true;
        }
        return false;
    }

    /**
     * Import a plugin via its ID, checking both installed NPM plugins and also
     * local plugin folders.
     * @param id The ID of the plugin to import.
     * @returns The loaded plugin, or 'undefined' if unsuccessful (e.g. the
     * module could not be found, or it was loaded but it was not a Hindenburg
     * plugin).
     *
     * @example
     * ```ts
     * const pluginCtr = await this.worker.pluginLoader.importFromId("hbplugin-my-plugin");
     *
     * if (!pluginCtr) {
     *   console.log("Failed to load my plugin.");
     *   return;
     * }
     * ```
     */
    async importFromId(id: string) {
        for (const pluginDirectory of this.pluginDirectories) {
            const resolvedPkg = resolvePkg(id, { cwd: pluginDirectory });

            const pluginPath = resolvedPkg
                || path.resolve(pluginDirectory, "./" + id);

            const pluginCtr = await this.importPlugin(pluginPath);

            if (!pluginCtr) {
                continue;
            }

            return pluginCtr;
        }

        return undefined;
    }

    /**
     * Import all plugins from the {@link PluginLoader.pluginDirectories}, from
     * both installed NPM plugins and local plugin folders.
     *
     * Does not load any of the plugins into the worker or a room, see {@link
     * PluginLoader.loadAllWorkerPlugins} and {@link PluginLoader.loadAllRoomPlugins}.
     * @returns A map of all plugins that were imported.
     *
     * @example
     * ```ts
     * const importedPlugins = this.worker.pluginDirectory.importFromDirectory();
     *
     * console.log("Imported %s plugins!", importedPlugins.size);
     * ```
     */
    async importFromDirectory() {
        const importedPlugins: Map<string, typeof WorkerPlugin|typeof RoomPlugin> = new Map;

        const pluginPaths: string[] = [];

        for (const pluginDirectory of this.pluginDirectories) {
            try {
                const packageJson = await fs.readFile(path.resolve(pluginDirectory, "package.json"), "utf8");
                const json = JSON.parse(packageJson) as { dependencies: Record<string, string> };

                for (const dependencyName in json.dependencies) {
                    if (dependencyName.startsWith("hbplugin-")) {
                        const resolvedPkg = resolvePkg(dependencyName, { cwd: pluginDirectory });
                        if (resolvedPkg) {
                            pluginPaths.push(resolvedPkg);
                        }
                    }
                }
            } catch (e) {
                if ((e as any).code !== undefined) {
                    if ((e as any).code === "ENOENT") {
                        this.worker.logger.warn("No package.json in plugin directory '%s'", chalk.grey(pluginDirectory));
                    }

                    this.worker.logger.warn("Could not open package.json at '%s': %s", chalk.grey(pluginDirectory), (e as any).code);
                } else {
                    throw e;
                }
            }

            const filesInDir = await fs.readdir(pluginDirectory);
            for (const file of filesInDir) {
                if (file.startsWith("hbplugin-")) {
                    pluginPaths.push(path.resolve(pluginDirectory, file));
                }
            }
        }

        for (const pluginPath of pluginPaths) {
            try {
                const pluginCtr = await this.importPlugin(pluginPath);

                if (!pluginCtr) {
                    this.worker.logger.warn("Did not load plugin at '%s', as it was not a hindenburg plugin",
                        pluginPath);
                    continue;
                }

                importedPlugins.set(pluginCtr.meta.id, pluginCtr);
            } catch (e) {
                this.worker.logger.warn("Could not import plugin '%s': %s", path.basename(pluginPath), e);
                throw e;
            }
        }

        return importedPlugins;
    }

    /**
     * Whether a worker plugin is enabled from both the config, and if the plugin
     * isn't marked with the {@link PreventLoad} decorator.
     * @param pluginCtr The plugin class to check.
     *
     * @example
     * ```ts
     * .@HindenburgPlugin("hbplugin-my-plugin", "1.0.0", "none")
     * class MyPlugin extends WorkerPlugin {}
     *
     * console.log(this.worker.pluginLoader.isEnabled(MyPlugin)); // true
     * ```
     *
     * @example
     * ```ts
     * .@PreventLoad
     * .@HindenburgPlugin("hbplugin-my-plugin", "1.0.0", "none")
     * class MyPlugin extends WorkerPlugin {}
     *
     * console.log(this.worker.pluginLoader.isEnabled(MyPlugin)); // false
     * ```
     */
    isEnabled(pluginCtr: typeof WorkerPlugin): boolean;
    /**
     * Whether a room plugin is enabled from both the global worker config, the
     * room config, and if the plugin isn't marked with the {@link PreventLoad}
     * decorator.
     * @param pluginCtr The plugin class to check.
     * @param room The room to check.
     *
     * @example
     * ```ts
     * .@HindenburgPlugin("hbplugin-my-plugin", "1.0.0", "none")
     * class MyPlugin extends RoomPlugin {}
     *
     * this.room.config.plugins["hbplugin-my-plugin"] = false;
     *
     * console.log(this.worker.pluginLoader.isEnabled(MyPlugin, this.room)); // true
     * ```
     *
     * @example
     * ```ts
     * .@PreventLoad
     * .@HindenburgPlugin("hbplugin-my-plugin", "1.0.0", "none")
     * class MyPlugin extends RoomPlugin {}
     *
     * console.log(this.worker.pluginLoader.isEnabled(MyPlugin, this.room)); // false
     * ```
     */
    isEnabled(pluginCtr: typeof RoomPlugin, room: Room): boolean;
    isEnabled(pluginClass: typeof WorkerPlugin|typeof RoomPlugin, room?: Room) {
        if (shouldPreventLoading(pluginClass))
            return;

        if (this.worker.config.plugins[pluginClass.meta.id] === false) {
            return false;
        }

        if (room && !room.config.plugins[pluginClass.meta.id] === false) {
            return false;
        }

        return true;
    }

    /**
     * Load all imported worker plugins into the worker, checking {@link PluginLoader.isEnabled}.
     * @example
     * ```ts
     * await this.worker.pluginLoader.loadAllWorkerPlugins();
     * ```
     */
    async loadAllWorkerPlugins() {
        const pluginCtrs = [];
        for (const [ , importedPlugin ] of this.workerPlugins) {
            pluginCtrs.push(importedPlugin);
        }
        pluginCtrs.sort((a, b) => {
            // first = -1
            // last = 1
            // none = 0
            // sort from lowest to highest
            const aInteger = a.meta.order === "first" ? -1 :
                a.meta.order === "last" ? 1 :
                    a.meta.order === "none" ? 0 : a.meta.order;

            const bInteger = b.meta.order === "first" ? -1 :
                b.meta.order === "last" ? 1 :
                    b.meta.order === "none" ? 0 : b.meta.order;

            if (bInteger < aInteger) {
                return 1;
            }
            if (aInteger < bInteger) {
                return -1;
            }

            return 0;
        });
        for (let i = 0; i < pluginCtrs.length; i++) {
            const importedPlugin = pluginCtrs[i];
            if (this.isEnabled(importedPlugin)) {
                await this.loadPlugin(importedPlugin);
            }
        }
    }

    /**
     * Load all imported room plugins into a room, checking {@link PluginLoader.isEnabled}.
     * @example
     * ```ts
     * await this.worker.pluginLoader.loadAllWorkerPlugins();
     * ```
     */
    async loadAllRoomPlugins(room: Room) {
        const pluginCtrs = [];
        for (const [ , importedPlugin ] of this.roomPlugins) {
            pluginCtrs.push(importedPlugin);
        }
        pluginCtrs.sort((a, b) => {
            // first = -1
            // last = 1
            // none = 0
            // sort from lowest to highest
            const aInteger = a.meta.order === "first" ? -1 :
                a.meta.order === "last" ? 1 :
                    a.meta.order === "none" ? 0 : a.meta.order;

            const bInteger = b.meta.order === "first" ? -1 :
                b.meta.order === "last" ? 1 :
                    b.meta.order === "none" ? 0 : b.meta.order;

            if (bInteger < aInteger) {
                return 1;
            }
            if (aInteger < bInteger) {
                return -1;
            }

            return 0;
        });
        for (let i = 0; i < pluginCtrs.length; i++) {
            const importedPlugin = pluginCtrs[i];
            if (this.isEnabled(importedPlugin, room)) {
                await this.loadPlugin(importedPlugin, room);
            }
        }
        this.applyChatCommands(room);
        this.applyReactorRpcHandlers(room);
        this.applyRegisteredPrefabs(room);
    }

    /**
     * Import a plugin from its absolute path on the filesystem.
     * @param pluginPath The path of the plugin to import.
     * @returns The imported plugin constructor, or false if the plugin failed
     * to be imported or was not a Hindenburg plugin.
     *
     * @example
     * ```ts
     * const pluginCtr = await this.worker.pluginLoader.importPlugin("/home/user/hindenburg/plugins/hbplugin-my-plugin");
     *
     * if (!pluginCtr) {
     *   console.log("Failed to load my plugin!");
     *   return;
     * }
     * ```
     */
    async importPlugin(pluginPath: string): Promise<typeof WorkerPlugin|typeof RoomPlugin|false> {
        if (!path.isAbsolute(pluginPath)) {
            throw new Error("Expected an absolute path to a plugin but got a relative one.");
        }

        try {
            delete require.cache[require.resolve(pluginPath)];
        } catch (e) { // require.resolve will error if the module is not found
            return false;
        }
        const { default: pluginCtr } = await import(pluginPath) as { default: typeof WorkerPlugin|typeof RoomPlugin };

        if (!PluginLoader.isHindenburgPlugin(pluginCtr))
            return false;

        const isWorkerPlugin = PluginLoader.isWorkerPlugin(pluginCtr);
        const isRoomPlugin = PluginLoader.isRoomPlugin(pluginCtr);

        if (!isWorkerPlugin && !isRoomPlugin)
            return false;

        if (isWorkerPlugin) {
            this.workerPlugins.set(pluginCtr.meta.id, pluginCtr as unknown as typeof WorkerPlugin);
        } else if (isRoomPlugin) {
            this.roomPlugins.set(pluginCtr.meta.id, pluginCtr as unknown as typeof RoomPlugin);
        }

        Reflect.defineMetadata(hindenburgPluginDirectory, pluginPath, pluginCtr);

        return pluginCtr;
    }

    private applyChatCommands(room: Room) {
        room.chatCommandHandler.registeredCommands.clear();
        room.chatCommandHandler.registerHelpCommand();
        for (const [ , loadedPlugin ] of this.worker.loadedPlugins) {
            const pluginChatCommands = getPluginChatCommands(loadedPlugin);
            for (const chatCommand of pluginChatCommands) {
                room.chatCommandHandler.registerCommand(chatCommand.usage, chatCommand.description, chatCommand.handler.bind(loadedPlugin));
            }
        }

        for (const [ , loadedPlugin ] of room.loadedPlugins) {
            const pluginChatCommands = getPluginChatCommands(loadedPlugin);
            for (const chatCommand of pluginChatCommands) {
                room.chatCommandHandler.registerCommand(chatCommand.usage, chatCommand.description, chatCommand.handler.bind(loadedPlugin));
            }
        }
    }

    private getReactorRpcHandlers(room: Room, reactorRpc: typeof BaseReactorRpcMessage) {
        const cachedHandlers = room.reactorRpcHandlers.get(reactorRpc);
        const handlers = cachedHandlers || [];
        if (!cachedHandlers) {
            room.reactorRpcs.set(`${reactorRpc.modId}:${reactorRpc.messageTag}`, reactorRpc);
            room.reactorRpcHandlers.set(reactorRpc, handlers);
        }
        return handlers;
    }

    private applyReactorRpcHandlers(room: Room) {
        room.reactorRpcHandlers.clear();
        for (const [ , loadedPlugin ] of this.worker.loadedPlugins) {
            for (const reactorRpcHandlerInfo of loadedPlugin.loadedReactorRpcHandlers) {
                this.getReactorRpcHandlers(room, reactorRpcHandlerInfo.reactorRpc).push(reactorRpcHandlerInfo.handler.bind(loadedPlugin));
            }
        }

        for (const [ , loadedPlugin ] of room.loadedPlugins) {
            for (const reactorRpcHandlerInfo of loadedPlugin.loadedReactorRpcHandlers) {
                this.getReactorRpcHandlers(room, reactorRpcHandlerInfo.reactorRpc).push(reactorRpcHandlerInfo.handler.bind(loadedPlugin));
            }
        }
    }

    private applyRegisteredPrefabs(room: Room) {
        room.spawnPrefabs = new Map([
            [SpawnType.ShipStatus, [ SkeldShipStatus ]],
            [SpawnType.MeetingHud, [ MeetingHud ]],
            [SpawnType.LobbyBehaviour, [ LobbyBehaviour ]],
            [SpawnType.GameData, [ GameData, VoteBanSystem ]],
            [SpawnType.Player, [ PlayerControl, PlayerPhysics, CustomNetworkTransform ]],
            [SpawnType.Headquarters, [ MiraShipStatus ]],
            [SpawnType.PlanetMap, [ PolusShipStatus ]],
            [SpawnType.AprilShipStatus, [ AprilShipStatus ]],
            [SpawnType.Airship, [ AirshipStatus ]]
        ]);

        for (const [ , loadedPlugin ] of this.worker.loadedPlugins) {
            for (const registeredPrefab of loadedPlugin.registeredPrefabs) {
                room.registerPrefab(registeredPrefab.spawnType, registeredPrefab.components);
            }
        }

        for (const [ , loadedPlugin ] of room.loadedPlugins) {
            for (const registeredPrefab of loadedPlugin.registeredPrefabs) {
                room.registerPrefab(registeredPrefab.spawnType, registeredPrefab.components);
            }
        }
    }

    private applyRegisteredMessages() {
        const listeners = new Map([...this.worker.decoder.listeners]);
        this.worker.decoder.reset();
        this.worker.decoder.listeners = listeners;
        this.worker.registerMessages();

        for (const [ , loadedPlugin ] of this.worker.loadedPlugins) {
            for (let i = 0; i <  loadedPlugin.loadedRegisteredMessages.length; i++) {
                const messageClass = loadedPlugin.loadedRegisteredMessages[i];
                this.worker.decoder.register(messageClass);
            }
        }
    }

    private applyMessageHandlers() {
        this.worker.decoder.listeners.clear();
        this.worker.registerPacketHandlers();

        for (const [ , loadedPlugin ] of this.worker.loadedPlugins) {
            for (let i = 0; i < loadedPlugin.loadedMessageHandlers.length; i++) {
                const { messageCtr, handler, options } = loadedPlugin.loadedMessageHandlers[i];
                if (options.override) {
                    this.worker.decoder.listeners.delete(`${messageCtr.messageType}:${messageCtr.messageTag}`);
                }

                this.worker.decoder.on(messageCtr, (message, direction, ctx) => handler(message, ctx));
            }
        }
    }

    /**
     * Load a global worker plugin into the worker, does not regard {@link PluginLoader.isEnabled},
     * waits for {@link Plugin.onPluginLoad} to be finish.
     * @param pluginCtr The plugin ID or class to load.
     * @returns The plugin instance that was loaded.
     * @throws If there was an attempt to load a plugin that isn't imported, or
     * if the server tries load a worker plugin onto a room.
     *
     * @example
     * ```ts
     * const importedPlugin = await this.worker.workerPlugins.get("hbplugin-my-plugin");
     * await this.worker.pluginLoader.loadPlugin(importedPlugin);
     * ```
     *
     * @example
     * ```ts
     * const importedPlugin = await this.worker.workerPlugins.get("hbplugin-my-plugin");
     * await this.worker.pluginLoader.loadPlugin(importedPlugin, this.room); // !! Attempted to load a worker plugin on a room or other non-worker object
     * ```
     *
     * @example
     * ```ts
     * await this.worker.pluginLoader.loadPlugin("hbplugin-what-the-hell"); // !! Plugin with ID 'hbplugin-what-the-hell' not imported
     * ```
     */
    async loadPlugin(pluginCtr: string|typeof WorkerPlugin): Promise<WorkerPlugin>;
    /**
     * Load a room plugin into a room, does not regard {@link PluginLoader.isEnabled},
     * waits for {@link Plugin.onPluginLoad} to be finish.
     * @param pluginCtr The plugin ID or class to load.
     * @param room The room to load the plugin into.
     * @returns The plugin instance that was loaded.
     * @throws If there was an attempt to load a plugin that isn't imported, or
     * if the server tries load a room plugin onto the worker.
     *
     * @example
     * ```ts
     * const importedPlugin = await this.worker.roomPlugins.get("hbplugin-my-plugin");
     * await this.worker.pluginLoader.loadPlugin(importedPlugin, this.room);
     * ```
     *
     * @example
     * ```ts
     * const importedPlugin = await this.worker.roomPlugins.get("hbplugin-my-plugin");
     * await this.worker.pluginLoader.loadPlugin(importedPlugin); // !! Attempted to load a room plugin on a worker or other non-room object
     * ```
     *
     * @example
     * ```ts
     * await this.worker.pluginLoader.loadPlugin("hbplugin-what-the-hell", this.room); // !! Plugin with ID 'hbplugin-what-the-hell' not imported
     * ```
     */
    async loadPlugin(pluginCtr: string|typeof RoomPlugin, room?: Room): Promise<RoomPlugin>;
    async loadPlugin(pluginCtr: string|typeof WorkerPlugin|typeof RoomPlugin, room?: Room): Promise<WorkerPlugin | RoomPlugin> {
        if (typeof pluginCtr === "string") {
            const _pluginCtr = room
                ? this.roomPlugins.get(pluginCtr)
                : this.workerPlugins.get(pluginCtr);

            if (!_pluginCtr) {
                throw new Error("Plugin with ID '" + pluginCtr + "' not imported");
            }
            if (PluginLoader.isRoomPlugin(_pluginCtr)) {
                return await this.loadPlugin(_pluginCtr, room);
            } else {
                return await this.loadPlugin(_pluginCtr);
            }
        }

        const defaultConfig = recursiveClone(pluginCtr.meta.defaultConfig);
        recursiveAssign(defaultConfig, this.worker.config.plugins[pluginCtr.meta.id] || {});

        const isWorkerPlugin = PluginLoader.isWorkerPlugin(pluginCtr);
        const isRoomPlugin = PluginLoader.isRoomPlugin(pluginCtr);

        if (isWorkerPlugin && room) {
            throw new Error("Attempted to load a worker plugin on a room or other non-worker object");
        } else if (isRoomPlugin && !room) {
            throw new Error("Attempted to load a room plugin on a worker or other non-room object");
        }

        const initPlugin = isWorkerPlugin
            ? new (pluginCtr as unknown as typeof WorkerPlugin)(this.worker, defaultConfig)
            : new (pluginCtr as unknown as typeof RoomPlugin)(room!, defaultConfig);

        const reactorRpcHandlers = getPluginReactorRpcHandlers(initPlugin);

        for (const reactorRpcHandler of reactorRpcHandlers) {
            initPlugin.loadedReactorRpcHandlers.push(reactorRpcHandler);
        }

        if (isRoomPlugin && room) {
            room.loadedPlugins.set(pluginCtr.meta.id, initPlugin as RoomPlugin);
            this.applyChatCommands(room);
            this.applyReactorRpcHandlers(room);

            room.logger.info("Loaded plugin: %s", initPlugin);
        }

        if (isWorkerPlugin) {
            const cliCommands = getPluginCliCommands(initPlugin);
            const messageHandlers = getPluginMessageHandlers(initPlugin);
            const registeredMessages = getPluginRegisteredMessages(pluginCtr);
            const registeredPrefabs = getPluginRegisteredPrefabs(pluginCtr);

            for (const commandInfo of cliCommands) {
                const command = this.worker.vorpal.command(commandInfo.command.usage, commandInfo.command.description);

                if (commandInfo.command.options) {
                    for (let i = 0; i < commandInfo.command.options.length; i++) {
                        const option = commandInfo.command.options[i];
                        command.option(option.usage, option.description || "");
                    }
                }

                const fn = commandInfo.handler.bind(initPlugin);
                command.action(fn);

                initPlugin.loadedCliCommands.push(command);
            }

            for (const messageHandlerInfo of messageHandlers) {
                initPlugin.loadedMessageHandlers.push({
                    messageCtr: messageHandlerInfo.messageClass,
                    options: messageHandlerInfo.options,
                    handler: messageHandlerInfo.handler.bind(initPlugin)
                });
            }

            initPlugin.loadedRegisteredMessages = [...registeredMessages];
            initPlugin.registeredPrefabs = [...registeredPrefabs];

            this.worker.loadedPlugins.set(pluginCtr.meta.id, initPlugin as WorkerPlugin);

            this.applyMessageHandlers();
            this.applyRegisteredMessages();

            this.worker.logger.info("Loaded plugin globally: %s", initPlugin);
        }

        const eventListeners = getPluginEventListeners(initPlugin);

        for (const eventListenerInfo of eventListeners) {
            const fn = eventListenerInfo.handler.bind(initPlugin);
            if (room) {
                room.on(eventListenerInfo.eventName, fn);
            } else {
                this.worker.on(eventListenerInfo.eventName, fn);
            }
            initPlugin.loadedEventListeners.push({
                eventName: eventListenerInfo.eventName,
                handler: fn
            });
        }

        await initPlugin.onPluginLoad();

        return initPlugin;
    }

    /**
     * Unload a global worker plugin from the worker, calls but doesn't wait for
     * {@link Plugin.onPluginUnload} to finish.
     * @param pluginCtr The plugin ID, class, or instance to unload.
     * @throws If there was an attempt to unload a plugin that isn't loaded.
     * @example
     * ```ts
     * this.worker.pluginLoader.unloadPlugin("hbplugin-some-plugin");
     * ```
     *
     * @example
     * ```ts
     * this.worker.pluginLoader.unloadPlugin("hbplugin-what-the-hell"); // !! Plugin with id 'hbplugin-what-the-hell' not loaded
     * ```
     */
    unloadPlugin(pluginCtr: string|WorkerPlugin|typeof WorkerPlugin): void;
    /**
     * Unload a room plugin from a room, calls but doesn't wait for
     * {@link Plugin.onPluginUnload} to finish.
     * @param pluginCtr The plugin ID, class, or instance to unload.
     * @param room The room to unload the plugin from.
     * @throws If there was an attempt to unload a plugin that isn't loaded.
     * @example
     * ```ts
     * this.worker.pluginLoader.unloadPlugin("hbplugin-some-plugin");
     * ```
     *
     * @example
     * ```ts
     * this.worker.pluginLoader.unloadPlugin("hbplugin-what-the-hell"); // !! Plugin with id 'hbplugin-what-the-hell' not loaded
     * ```
     */
    unloadPlugin(pluginCtr: string|RoomPlugin|typeof RoomPlugin, room: Room): void;
    unloadPlugin(pluginCtr: string|RoomPlugin|typeof RoomPlugin|WorkerPlugin|typeof WorkerPlugin, room?: Room) {
        const pluginId = typeof pluginCtr === "string"
            ? pluginCtr
            : pluginCtr.meta.id;

        const loadedPlugin = room
            ? room.loadedPlugins.get(pluginId)
            : this.worker.loadedPlugins.get(pluginId);

        if (!loadedPlugin)
            throw new Error("Plugin with id '" + pluginId + "' not loaded");

        loadedPlugin.onPluginUnload();

        if (room) {
            room.loadedPlugins.delete(pluginId);
            this.applyChatCommands(room);
            room.logger.info("Unloaded plugin: %s", loadedPlugin);
        } else {
            this.worker.loadedPlugins.delete(pluginId);
            this.applyMessageHandlers();
            this.applyRegisteredMessages();
            this.worker.logger.info("Unloaded plugin globally: %s", loadedPlugin);
        }

        for (const loadedEventListener of loadedPlugin.loadedEventListeners) {
            if (room) {
                room.off(loadedEventListener.eventName as keyof RoomEvents, loadedEventListener.handler);
            } else {
                this.worker.off(loadedEventListener.eventName as keyof WorkerEvents, loadedEventListener.handler);
            }
        }
    }
}
