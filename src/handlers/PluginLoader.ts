import "reflect-metadata";

import path from "path";
import fs from "fs/promises";

import PackageJson from "@schemastore/package";
import resolvePkg from "resolve-pkg";
import chalk from "chalk";
import minimatch from "minimatch";

import {
    AirshipStatus,
    AprilShipStatus,
    CustomNetworkTransform,
    GameData,
    LobbyBehaviour,
    MeetingHud,
    MiraShipStatus,
    Networkable,
    NetworkableEvents,
    PlayerControl,
    PlayerData,
    PlayerPhysics,
    PolusShipStatus,
    SkeldShipStatus,
    SpawnType,
    VoteBanSystem
} from "@skeldjs/core";

import { RoomEvents, Room, Worker, WorkerEvents, PacketContext } from "../worker";

import {
    getPluginChatCommands,
    getPluginCliCommands,
    getPluginEventListeners,
    getPluginMessageHandlers,
    getPluginReactorRpcHandlers,
    getPluginRegisteredMessages,
    isHindenburgPlugin,
    BaseReactorRpcMessage,
    shouldPreventLoading,
    getPluginRegisteredPrefabs,
    WorkerImportPluginEvent,
    WorkerLoadPluginEvent
} from "../api";

import { recursiveClone } from "../util/recursiveClone";
import { recursiveAssign } from "../util/recursiveAssign";

import { getPluginDependencies } from "../api/hooks/Dependency";
import { SomePluginCtr } from "./Plugin";

export const hindenburgPluginDirectory = Symbol("hindenburg:plugindirectory");

export interface PluginPackageJsonOptions {

}

export interface PluginPackageJson extends PackageJson {
    plugin: PluginPackageJsonOptions;
}

export class ImportedPlugin {
    constructor(
        public readonly pluginCtr: SomePluginCtr,
        public readonly packageJson: PackageJson
    )
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
     * A map of every worker and room plugin that has been imported.
     */
    importedPlugins: Map<string, SomePluginCtr>;

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
        this.importedPlugins = new Map;
    }

    /**
     * Check whether some object is a Hindenburg plugin.
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
     * .@HindenburgPlugin("hbplugin-fun-things", "1.0.0", "none")
     * class MyPlugin extends RoomPlugin {}
     *
     * console.log(this.worker.pluginLoad.isWorkerPlugin(MyPlugin)); // false
     * ```
     *
     * @example
     * ```ts
     * .@HindenburgPlugin("hbplugin-fun-things", "1.0.0", "none")
     * class MyPlugin extends WorkerPlugin {}
     *
     * console.log(this.worker.pluginLoad.isWorkerPlugin(MyPlugin)); // true
     * ```
     */
    static isWorkerPlugin(pluginCtr: SomePluginCtr): pluginCtr is typeof WorkerPlugin {
        let currentCtr: SomePluginCtr = pluginCtr;
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
     * .@HindenburgPlugin("hbplugin-fun-things", "1.0.0", "none")
     * class MyPlugin extends RoomPlugin {}
     *
     * console.log(this.worker.pluginLoad.isRoomPlugin(MyPlugin)); // true
     * ```
     *
     * @example
     * ```ts
     * .@HindenburgPlugin("hbplugin-fun-things", "1.0.0", "none")
     * class MyPlugin extends WorkerPlugin {}
     *
     * console.log(this.worker.pluginLoad.isRoomPlugin(MyPlugin)); // false
     * ```
     */
    static isRoomPlugin(pluginCtr: SomePluginCtr): pluginCtr is typeof RoomPlugin {
        let currentCtr: SomePluginCtr = pluginCtr;
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
     * const pluginCtr = await this.worker.pluginLoader.importFromId("hbplugin-fun-things");
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

            if (!pluginCtr)
                continue;

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
        const importedPlugins: Map<string, SomePluginCtr> = new Map;

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
                        this.worker.logger.warn("No package.json in plugin directory '%s' - try running 'yarn setup'", chalk.grey(pluginDirectory));
                        continue;
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

                if (!pluginCtr)
                    continue;

                importedPlugins.set(pluginCtr.meta.id, pluginCtr);
            } catch (e: any) {
                this.worker.logger.warn("Couldn't import plugin '%s': %s", path.basename(pluginPath), e.message || e);
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
     * .@HindenburgPlugin("hbplugin-fun-things", "1.0.0", "none")
     * class MyPlugin extends WorkerPlugin {}
     *
     * console.log(this.worker.pluginLoader.isEnabled(MyPlugin)); // true
     * ```
     *
     * @example
     * ```ts
     * .@PreventLoad
     * .@HindenburgPlugin("hbplugin-fun-things", "1.0.0", "none")
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
     * .@HindenburgPlugin("hbplugin-fun-things", "1.0.0", "none")
     * class MyPlugin extends RoomPlugin {}
     *
     * this.room.config.plugins["hbplugin-fun-things"] = false;
     *
     * console.log(this.worker.pluginLoader.isEnabled(MyPlugin, this.room)); // true
     * ```
     *
     * @example
     * ```ts
     * .@PreventLoad
     * .@HindenburgPlugin("hbplugin-fun-things", "1.0.0", "none")
     * class MyPlugin extends RoomPlugin {}
     *
     * console.log(this.worker.pluginLoader.isEnabled(MyPlugin, this.room)); // false
     * ```
     */
    isEnabled(pluginCtr: typeof RoomPlugin, room: Room): boolean;
    isEnabled(pluginClass: SomePluginCtr, room?: Room) {
        if (shouldPreventLoading(pluginClass))
            return;

        if (this.worker.config.plugins[pluginClass.meta.id] === false)
            return false;

        if (room && !room.config.plugins[pluginClass.meta.id] === false)
            return false;

        return true;
    }

    /**
     * Get all plugins that depend on this plugin.
     * @param plugin The plugin in question.
     * @param pluginCtrs An optional list of plugins tok find dependents in. Uses the imported plugins if not supplied.
     * @returns All plugins in {@link pluginCtrs} that depend on {@link plugin.} 
     */
    getPluginDependents(plugin: SomePluginCtr, pluginCtrs: (SomePluginCtr)[] = [...this.importedPlugins.values()]) {
        const dependents = [];
        for (const pluginCtr of pluginCtrs) {
            if (pluginCtr === plugin)
                continue;

            const dependencies = getPluginDependencies(pluginCtr);
            for (const dependency of dependencies) {
                if (dependency.pluginId === plugin.meta.id) {
                    dependents.push(pluginCtr);
                    break;
                }
            }
        }
        return dependents;
    }

    protected sortVisit(
        dependents: (SomePluginCtr)[],
        graph: (SomePluginCtr)[],
        circularCheck: Set<string>,
        marked: Set<string>,
        node: SomePluginCtr
    ) {
        if (circularCheck.has(node.meta.id))
            throw new Error("Circular dependency found");

        if (marked.has(node.meta.id))
            return false;

        circularCheck.add(node.meta.id);
        for (const dependent of this.getPluginDependents(node, dependents)) {
            if (!this.sortVisit(dependents, graph, circularCheck, marked, dependent))
                return false;
        }
        marked.add(node.meta.id);
        circularCheck.delete(node.meta.id);
        dependents.push(node);
        return true;
    }

    protected sortPlugins(pluginCtrs: (SomePluginCtr)[]) {
        pluginCtrs.sort((a, b) => {
            // first = -1
            // last = 1
            // none = 0
            // sort from lowest to highest
            const aInteger = a.meta.loadOrder === "first" ? -1 :
                a.meta.loadOrder === "last" ? 1 :
                    a.meta.loadOrder === "none" || a.meta.loadOrder === undefined ? 0 : a.meta.loadOrder;

            const bInteger = b.meta.loadOrder === "first" ? -1 :
                b.meta.loadOrder === "last" ? 1 :
                    b.meta.loadOrder === "none" || a.meta.loadOrder === undefined ? 0 : b.meta.loadOrder;

            if (bInteger < aInteger) {
                return 1;
            }
            if (aInteger < bInteger) {
                return -1;
            }

            return 0;
        });

        const marked: Set<string> = new Set;

        const dependents: (SomePluginCtr)[] = [];

        for (const pluginCtr of pluginCtrs) {
            if (marked.has(pluginCtr.meta.id))
                continue;

            const circularCheck: Set<string> = new Set;
            if (!this.sortVisit(dependents, pluginCtrs, circularCheck, marked, pluginCtr))
                break;
        }

        pluginCtrs.reverse();
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
        for (const [ , importedPlugin ] of this.importedPlugins) {
            if (!PluginLoader.isWorkerPlugin(importedPlugin))
                continue;

            pluginCtrs.push(importedPlugin);
        }
        this.sortPlugins(pluginCtrs);
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
        for (const [ , importedPlugin ] of this.importedPlugins) {
            if (!PluginLoader.isRoomPlugin(importedPlugin))
                continue;

            pluginCtrs.push(importedPlugin);
        }
        this.sortPlugins(pluginCtrs);
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

    async getPluginPackageJson(pluginPath: string): Promise<any> {
        try {
            const packageJsonText = await fs.readFile(path.resolve(pluginPath, "package.json"), "utf8");
            try {
                return JSON.parse(packageJsonText);
            } catch (e) {
                throw new Error("Couldn't parse package.json, it must be invalid");
            }
        } catch (e: any) {
            if (e && e.code === "ENOENT") {
                return undefined;
            }

            throw e;
        }
    }

    /**
     * Generate a random plugin ID.
     * 
     * Note that this will return one even if it is taken, see {@link PluginLoader.generateRandomPluginIdSafe}
     * if you need one that is not taken.
     * @returns A random plugin ID.
     */
    generateRandomPluginId() {
        const colour = colours[Math.random() * colours.length];
        const role = roles[Math.random() * roles.length];
        return "hbplugin-" + colour + "-" + role;
    }

    /**
     * Generate a random plugin ID that has not been taken by any other plugins.
     * @returns A random plugin ID that can safely be used.
     */
    generateRandomPluginIdSafe() {
        let pluginId = this.generateRandomPluginId();
        while (this.roomPlugins.has(pluginId)) {
            pluginId = this.generateRandomPluginId();
        }

        return pluginId;
    }

    /**
     * Import a plugin from its absolute path on the filesystem.
     * @param pluginPath The path of the plugin to import.
     * @returns The imported plugin constructor, or false if the plugin failed
     * to be imported or was not a Hindenburg plugin.
     *
     * @example
     * ```ts
     * const pluginCtr = await this.worker.pluginLoader.importPlugin("/home/user/hindenburg/plugins/hbplugin-fun-things");
     *
     * if (!pluginCtr) {
     *   console.log("Failed to load my plugin!");
     *   return;
     * }x
     * ```
     */
    async importPlugin(pluginPath: string): Promise<SomePluginCtr|false> {
        if (!path.isAbsolute(pluginPath)) {
            throw new Error("Expected an absolute path to a plugin but got a relative one.");

        const packageJson = await this.getPluginPackageJson(pluginPath);
        if (packageJson && packageJson.engines && packageJson.engines.hindenburg)
            if (!minimatch(Worker.serverVersion, packageJson.engines.hindenburg))
                throw new Error("Built for an incompatible version of hindenburg");

        try {
            delete require.cache[require.resolve(pluginPath)];
        } catch (e) { // require.resolve will error if the module is not found
            throw new Error("The path didn't exist or wasn't a javascript module");
        }
        const { default: pluginCtr } = await import(pluginPath) as { default: SomePluginCtr };

        const packageJsonMeta = packageJson ? {
            id: packageJson.name || this.generateRandomPluginIdSafe(),
            version: packageJson.version || "1.0.0",
            loadOrder: packageJson.plugin ? packageJson.plugin.loadOrder || "none" : "none",
            defaultConfig: packageJson.plugin ? packageJson.plugin.defaultConfig || {} : {}
        } : undefined;

        if (pluginCtr.meta) {
            pluginCtr.meta = { ...packageJsonMeta, ...pluginCtr.meta };
        } else if (packageJsonMeta) {
            pluginCtr.meta = packageJsonMeta;
        } else {
            this.worker.logger.warn("Imported plugin had no attached metadata, assigning random id");
            pluginCtr.meta = {
                id: this.generateRandomPluginIdSafe(),
                version: "1.0.0",
                loadOrder: "none",
                defaultConfig: {}
            };
        }
        
        if (!PluginLoader.isHindenburgPlugin(pluginCtr))
            throw new Error("The imported module wasn't a Hindenburg plugin");

        const ev = await this.worker.emit(
            new WorkerImportPluginEvent(
                pluginPath,
                pluginCtr
            )
        );

        if (ev.canceled)
            return false;

        const isWorkerPlugin = PluginLoader.isWorkerPlugin(ev.alteredPlugin);
        const isRoomPlugin = PluginLoader.isRoomPlugin(ev.alteredPlugin);

        if (!isWorkerPlugin && !isRoomPlugin)
            throw new Error("The imported module wasn't a worker or room plugin");

        this.importedPlugins.set(ev.alteredPlugin.meta.id, ev.alteredPlugin);

        Reflect.defineMetadata(hindenburgPluginDirectory, pluginPath, ev.alteredPlugin);

        return ev.alteredPlugin;
    }

    private applyChatCommands(room: Room) {
        room.chatCommandHandler.registeredCommands.clear();
        room.chatCommandHandler.registerHelpCommand();
        for (const [ , loadedPlugin ] of room.workerPlugins) {
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
        for (const [ , loadedPlugin ] of room.workerPlugins) {
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
        room.registeredPrefabs = new Map([
            [SpawnType.SkeldShipStatus, [ SkeldShipStatus ]],
            [SpawnType.MeetingHud, [ MeetingHud ]],
            [SpawnType.LobbyBehaviour, [ LobbyBehaviour ]],
            [SpawnType.GameData, [ GameData, VoteBanSystem ]],
            [SpawnType.Player, [ PlayerControl, PlayerPhysics, CustomNetworkTransform ]],
            [SpawnType.MiraShipStatus, [ MiraShipStatus ]],
            [SpawnType.Polus, [ PolusShipStatus ]],
            [SpawnType.AprilShipStatus, [ AprilShipStatus ]],
            [SpawnType.Airship, [ AirshipStatus ]]
        ]);

        for (const [ , loadedPlugin ] of room.workerPlugins) {
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
                    const key = `${messageCtr.messageType}:${messageCtr.messageTag}` as const;
                    const listeners = this.worker.decoder.listeners.get(key) || [];
                    this.worker.decoder.listeners.delete(key);

                    this.worker.decoder.on(messageCtr, (message, direction, ctx) => {
                        handler(message, ctx, listeners.map(x => {
                            return (message: Serializable, ctx: PacketContext) => x(message, MessageDirection.Serverbound, ctx);
                        }));
                    });
                    continue;
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
     * const importedPlugin = await this.worker.workerPlugins.get("hbplugin-fun-things");
     * await this.worker.pluginLoader.loadPlugin(importedPlugin);
     * ```
     *
     * @example
     * ```ts
     * const importedPlugin = await this.worker.workerPlugins.get("hbplugin-fun-things");
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
     * const importedPlugin = await this.worker.roomPlugins.get("hbplugin-fun-things");
     * await this.worker.pluginLoader.loadPlugin(importedPlugin, this.room);
     * ```
     *
     * @example
     * ```ts
     * const importedPlugin = await this.worker.roomPlugins.get("hbplugin-fun-things");
     * await this.worker.pluginLoader.loadPlugin(importedPlugin); // !! Attempted to load a room plugin on a worker or other non-room object
     * ```
     *
     * @example
     * ```ts
     * await this.worker.pluginLoader.loadPlugin("hbplugin-what-the-hell", this.room); // !! Plugin with ID 'hbplugin-what-the-hell' not imported
     * ```
     */
    async loadPlugin(pluginCtr: string|typeof RoomPlugin, room?: Room): Promise<RoomPlugin>;
    async loadPlugin(pluginCtr: string|SomePluginCtr, room?: Room): Promise<WorkerPlugin | RoomPlugin> {
        if (typeof pluginCtr === "string") {
            const _pluginCtr = this.importedPlugins.get(pluginCtr);

            if (!_pluginCtr) {
                throw new Error("Plugin with ID '" + pluginCtr + "' not imported");
            }
            if (PluginLoader.isRoomPlugin(_pluginCtr)) {
                return await this.loadPlugin(_pluginCtr, room);
            } else {
                return await this.loadPlugin(_pluginCtr);
            }
        }

        const defaultConfig = recursiveClone(pluginCtr.meta.defaultConfig || {});
        recursiveAssign(defaultConfig, this.worker.config.plugins[pluginCtr.meta.id] || {});

        const isWorkerPlugin = PluginLoader.isWorkerPlugin(pluginCtr);
        const isRoomPlugin = PluginLoader.isRoomPlugin(pluginCtr);

        if (isWorkerPlugin && room) {
            throw new Error("Attempted to load a worker plugin on a room or other non-worker object");
        } else if (isRoomPlugin && !room) {
            throw new Error("Attempted to load a room plugin on a worker or other non-room object");
        }

        const initPlugin = isWorkerPlugin
            ? new pluginCtr(this.worker, defaultConfig)
            : new pluginCtr(room!, defaultConfig);

        const reactorRpcHandlers = getPluginReactorRpcHandlers(initPlugin);
        const registeredPrefabs = getPluginRegisteredPrefabs(pluginCtr);

        initPlugin.loadedReactorRpcHandlers = [...reactorRpcHandlers];
        initPlugin.registeredPrefabs = [...registeredPrefabs];

        if (isRoomPlugin && room) {
            room.loadedPlugins.set(pluginCtr.meta.id, initPlugin as RoomPlugin);
            this.applyChatCommands(room);
            this.applyReactorRpcHandlers(room);
            this.applyRegisteredPrefabs(room);

            room.logger.info("Loaded plugin: %s", initPlugin);
        }

        if (isWorkerPlugin) {
            const cliCommands = getPluginCliCommands(initPlugin);
            const messageHandlers = getPluginMessageHandlers(initPlugin);
            const registeredMessages = getPluginRegisteredMessages(pluginCtr);

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

        const ev = await this.worker.emit(
            new WorkerLoadPluginEvent(
                initPlugin,
                room
            )
        );

        if (ev.reverted) {
            if (initPlugin instanceof RoomPlugin) {
                this.unloadPlugin(initPlugin, room!);
            } else {
                this.unloadPlugin(initPlugin);
            }
            throw new Error("Event reverted load plugin");
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
     * this.worker.pluginLoader.unloadPlugin("hbplugin-fun-things");
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
     * this.worker.pluginLoader.unloadPlugin("hbplugin-fun-things");
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
