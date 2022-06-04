import "reflect-metadata";

import path from "path";
import fs from "fs/promises";

import { CoreProperties as PackageJson } from "@schemastore/package";
import resolvePkg from "resolve-pkg";
import chalk from "chalk";
import minimatch from "minimatch";

import {
    AirshipStatus,
    AprilShipStatus,
    CrewmateRole,
    CustomNetworkTransform,
    EngineerRole,
    GameData,
    GuardianAngelRole,
    ImpostorRole,
    LobbyBehaviour,
    MeetingHud,
    MiraShipStatus,
    PlayerControl,
    PlayerPhysics,
    PolusShipStatus,
    RoleType,
    ScientistRole,
    ShapeshifterRole,
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
    getPluginRegisteredRoles,
    WorkerImportPluginEvent,
    WorkerLoadPluginEvent,
    getPluginRegisteredPrefabs,
    getPluginHttpEndpoints
} from "../api";

import { recursiveClone } from "../util/recursiveClone";
import { recursiveAssign } from "../util/recursiveAssign";

import { getPluginDependencies, PluginDependencyDeclaration } from "../api/hooks/Dependency";
import { RoomPlugin, SomePluginCtr, WorkerPlugin } from "./Plugin";
import { MessageDirection, Serializable } from "@skeldjs/protocol";

export const hindenburgPluginDirectory = Symbol("hindenburg:plugindirectory");

export interface PluginPackageJsonOptions {
    loadOrder?: "first"|"last"|"none"|number;
    defaultConfig?: any;
    dependencies?: Record<string, boolean|Partial<Omit<PluginDependencyDeclaration, "pluginId">>>;
}

export interface PluginPackageJson extends PackageJson {
    plugin?: PluginPackageJsonOptions;
}

export class ImportedPlugin<PluginCtr extends typeof RoomPlugin|typeof WorkerPlugin = typeof RoomPlugin|typeof WorkerPlugin > {
    protected _cachedPackageJson?: PluginPackageJson;
    
    static async getPluginPackageJson(pluginPath: string): Promise<PluginPackageJson|undefined> {
        try {
            const packageJsonText = await fs.readFile(path.resolve(pluginPath, "package.json"), "utf8");
            try {
                return JSON.parse(packageJsonText) as PluginPackageJson;
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

    static async importPlugin(pluginLoader: PluginLoader, pluginPath: string) {
        if (!path.isAbsolute(pluginPath))
            throw new Error("Expected an absolute path to a plugin but got a relative one.");

        const packageJson = await this.getPluginPackageJson(pluginPath);

        if (!packageJson)
            throw new Error("No package.json for plugin found");

        if (packageJson.engines && packageJson.engines.hindenburg)
            if (!minimatch(Worker.serverVersion, packageJson.engines.hindenburg))
                throw new Error("Built for an incompatible version of hindenburg");

        try {
            delete require.cache[require.resolve(pluginPath)];
        } catch (e) { // require.resolve will error if the module is not found
            throw new Error("The path didn't exist or wasn't a javascript module");
        }
        const { default: pluginCtr } = await import(pluginPath) as { default: SomePluginCtr };
        
        if (!PluginLoader.isHindenburgPlugin(pluginCtr))
            throw new Error("The imported module wasn't a Hindenburg plugin");

        pluginCtr.baseDirectory = pluginPath;
        pluginCtr.packageJson = packageJson;
        
        const packageJsonMeta = {
            id: packageJson?.name || pluginLoader.generateRandomPluginIdSafe(),
            version: packageJson?.version || "1.0.0",
            loadOrder: packageJson?.plugin ? packageJson.plugin.loadOrder || "none" : "none",
            defaultConfig: packageJson?.plugin?.defaultConfig ? packageJson.plugin.defaultConfig : {}
        };

        if (pluginCtr.meta) {
            pluginCtr.meta = {
                id: pluginCtr.meta.id || packageJsonMeta?.id,
                version: pluginCtr.meta.version || packageJsonMeta?.version,
                loadOrder: pluginCtr.meta.loadOrder === undefined ? packageJsonMeta?.loadOrder : pluginCtr.meta.loadOrder,
                defaultConfig: pluginCtr.meta.defaultConfig || packageJsonMeta?.defaultConfig
            };
        } else {
            pluginCtr.meta = packageJsonMeta;
        }

        return new ImportedPlugin(pluginLoader, pluginCtr, pluginPath, packageJson);
    }

    constructor(
        protected readonly pluginLoader: PluginLoader,
        public readonly pluginCtr: PluginCtr,
        public readonly localDirectory: string,
        public readonly packageJson: PluginPackageJson = {}
    ) {}

    isWorkerPlugin(): this is ImportedPlugin<typeof WorkerPlugin> {
        return PluginLoader.isWorkerPlugin(this.pluginCtr);
    }

    isRoomPlugin(): this is ImportedPlugin<typeof RoomPlugin> {
        return PluginLoader.isRoomPlugin(this.pluginCtr);
    }

    isEnabled(room?: Room) {
        if (shouldPreventLoading(this.pluginCtr))
            return;

        if (this.pluginLoader.worker.config.plugins[this.pluginCtr.meta.id] === false)
            return false;

        if (room && !room.config.plugins[this.pluginCtr.meta.id] === false)
            return false;

        return true;
    }

    getDependencies() {
        const dependencies = this.packageJson.plugin?.dependencies
            ? { ...this.packageJson.plugin.dependencies }
            : {};
            
        for (const extraDependency of getPluginDependencies(this.pluginCtr)) { // dependencies defined with the @Dependency decorator
            dependencies[extraDependency.pluginId] = extraDependency;
        }

        return dependencies;
    }
}

const colours = [ "red", "blue", "green", "pink", "orange", "yellow", "black", "white", "purple", "brown", "cyan", "lime", "maroon", "rose", "banana", "gray", "tan", "coral" ];
const roles = [ "crewmate", "impostor", "scientist", "engineer", "guardian-angel", "shapeshift" ];

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
    importedPlugins: Map<string, ImportedPlugin>;

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
     * .@HindenburgPlugin("hbplugin-fun-things")
     * class MyPlugin extends RoomPlugin {}
     *
     * console.log(this.worker.pluginLoad.isWorkerPlugin(MyPlugin)); // false
     * ```
     *
     * @example
     * ```ts
     * .@HindenburgPlugin("hbplugin-fun-things")
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
     * .@HindenburgPlugin("hbplugin-fun-things")
     * class MyPlugin extends RoomPlugin {}
     *
     * console.log(this.worker.pluginLoad.isRoomPlugin(MyPlugin)); // true
     * ```
     *
     * @example
     * ```ts
     * .@HindenburgPlugin("hbplugin-fun-things")
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
     * Generate a random plugin ID.
     * 
     * Note that this will return one even if it is taken, see {@link PluginLoader.generateRandomPluginIdSafe}
     * if you need one that is not taken.
     * @returns A random plugin ID.
     */
    static generateRandomPluginId() {
        const colour = colours[Math.random() * colours.length];
        const role = roles[Math.random() * roles.length];
        return "hbplugin-" + colour + "-" + role;
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
        const importedPlugins: Map<string, ImportedPlugin> = new Map;

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
                const importedPlugin = await this.importPlugin(pluginPath);

                if (!importedPlugin)
                    continue;

                importedPlugins.set(importedPlugin.pluginCtr.meta.id, importedPlugin);
            } catch (e: any) {
                this.worker.logger.warn("Couldn't import plugin '%s': %s", path.basename(pluginPath), e.message || e);
            }
        }

        return importedPlugins;
    }

    protected sortPlugins(pluginCtrs: ImportedPlugin[]) {
        pluginCtrs.sort((a, b) => {
            const ameta = a.pluginCtr.meta;
            const bmeta = b.pluginCtr.meta;
            // first = -1
            // last = 1
            // none = 0
            // sort from lowest to highest
            const aInteger = ameta.loadOrder === "first" ? -1 :
                ameta.loadOrder === "last" ? 1 :
                    ameta.loadOrder === "none" || ameta.loadOrder === undefined ? 0 : ameta.loadOrder;

            const bInteger = bmeta.loadOrder === "first" ? -1 :
                bmeta.loadOrder === "last" ? 1 :
                    bmeta.loadOrder === "none" || ameta.loadOrder === undefined ? 0 : bmeta.loadOrder;

            if (bInteger < aInteger) {
                return 1;
            }
            if (aInteger < bInteger) {
                return -1;
            }

            return 0;
        });
    }

    protected async visitAndLoadPlugin(
        graph: ImportedPlugin[],
        visited: Map<ImportedPlugin, WorkerPlugin|RoomPlugin>,
        tree: Set<ImportedPlugin>,
        node: ImportedPlugin,
        room?: Room
    ): Promise<WorkerPlugin|RoomPlugin> {
        const alreadyLoaded = visited.get(node);
        if (alreadyLoaded)
            return alreadyLoaded;

        // if a circular dependency is found
        if (tree.has(node)) {
            const nodes = [...tree]; // flatten the search tree to a list
            let lastChild = node; // start searching backwards from the current node
            let currentParent: ImportedPlugin;

            do { // search backwards until a break is found in a dependency with "loadedBefore" set to false (a lazy dependency)
                currentParent = nodes.pop()!;
                const dependencies = currentParent.getDependencies();
                const lastNodeEdge = dependencies[lastChild.pluginCtr.meta.id]; // get the edge between this node & the parent

                // check if the edge/dependency between the child and parent is lazy, meaning it doesn't
                // necessarily _have_ to be loaded before the plugin, it just should be loaded at some point, whose
                // existence is checked below with the "missing dependency for: " error, which would be thrown if
                // a parent had a lazy dependency on a child but the child didn't exist or wasn't intended on being
                // loaded.
                if (typeof lastNodeEdge === "object" && lastNodeEdge.loadedBefore === false /* might be undefined & defaults to true */)
                    break;

                // move upwards through the tree/graph
                lastChild = currentParent;
            } while (nodes.length > 0);

            // if the loop didn't iterate again, because there were nodes more left, it means that
            // the currentNode wasn't updated, and since lastNode is set to currentNode before the
            // end of the loop, it makes more an easy check for whether or not a lazy dependency was found.
            if (lastChild === currentParent) {
                const searchedNodes = [...tree.keys(), node];
                throw new Error("Unsupported circular dependency: " + searchedNodes.map(node => node.pluginCtr.meta.id).join(" -> "));
            }

            throw lastChild; // throw the child that has a lazy connection to the parent. this is
            // caught later in the loop below to basically cancel this entire depth-search and
            // to tell the parent of the child that it has a lazy dependency on to send it to
            // the end of the search/graph to load later
        }

        // as this is a depth-first search, we need to be able to check for circular dependencies
        // this is done by keeping a temporary track of all nodes that this search vein/spanning tree
        // has been through. if it comes up again later, we can know by checking whether the current node
        // is in this set. 
        tree.add(node);
        const dependencies = node.getDependencies();
        for (const pluginId in dependencies) {
            if (pluginId === node.pluginCtr.meta.id) // technically this would work completely fine, but erroring anyway for bad habits
                throw new Error("Plugin depends on itself: " + node.pluginCtr.meta.id);

            const pluginInGraph = graph.find(plugin => plugin.pluginCtr.meta.id === pluginId); // find the plugin with that dependency plugin id in the graph
            const dependencyOptions = dependencies[pluginId];

            if (!pluginInGraph) {
                if (typeof dependencyOptions === "object" && dependencyOptions.optional)
                    continue; // if it's optional then we can just skip

                // note that this includes any lazy dependencies, which are checked above,
                // meaning that a lazy dependency _will_ get loaded at some point, just not
                // necessarily before the plugin is loaded.
                throw new Error("Missing dependency for '" + node.pluginCtr.meta.id + "': " + pluginId);
            }

            if (dependencyOptions) {
                const requiredVersion = typeof dependencyOptions === "boolean" ? "*" : dependencyOptions.version || "*";
                if (!minimatch(pluginInGraph.pluginCtr.meta.version, requiredVersion))
                    throw new Error(`Provided dependency but invalid version for '${node.pluginCtr.meta.id}': ${pluginId} (Needed ${requiredVersion}, got ${pluginInGraph.pluginCtr.meta.version})`);
            }

            try {
                await this.visitAndLoadPlugin(graph, visited, tree, pluginInGraph);
            } catch (e) {
                // this is thrown above, and is the result of a lazy dependency which must be loaded
                // after the plugin due to circular dependencies.
                if (e === pluginInGraph) {
                    const idx = graph.indexOf(pluginInGraph);
                    graph.push(graph.splice(idx, 1)[0]); // move to the end of the imported plugins array
                } else {
                    throw e;
                }
            }
        }
        const loadedPlugin = node.isRoomPlugin()
            ? await this.loadPlugin(node, room!)
            : await this.loadPlugin(node as ImportedPlugin<typeof WorkerPlugin>);

        tree.delete(node);
        visited.set(node, loadedPlugin);
        return loadedPlugin;
    }

    /**
     * Load all imported worker plugins into the worker, checking {@link PluginLoader.isEnabled}.
     * @example
     * ```ts
     * await this.worker.pluginLoader.loadAllWorkerPlugins();
     * ```
     */
    async loadAllWorkerPlugins() {
        const importedPlugins = [];
        for (const [ , importedPlugin ] of this.importedPlugins) {
            if (!importedPlugin.isWorkerPlugin())
                continue;

            importedPlugins.push(importedPlugin);
        }
        this.sortPlugins(importedPlugins);
        const loadedPlugins: Map<ImportedPlugin, WorkerPlugin> = new Map;
        for (const importedPlugin of importedPlugins) {
            if (importedPlugin.isEnabled()) {
                await this.visitAndLoadPlugin(importedPlugins, loadedPlugins, new Set, importedPlugin);
            }
        }
    }

    /**
     * Load all imported room plugins into a room, checking {@link PluginLoader.isEnabled}.
     * @example
     * ```ts
     * await this.worker.pluginLoader.loadAllWorkerPlugins();
     * ```7
     */
    async loadAllRoomPlugins(room: Room) {
        const importedPlugins = [];
        for (const [ , importedPlugin ] of this.importedPlugins) {
            if (!importedPlugin.isRoomPlugin())
                continue;

            importedPlugins.push(importedPlugin);
        }
        this.sortPlugins(importedPlugins);
        const loadedPlugins: Map<ImportedPlugin, RoomPlugin> = new Map;
        for (const importedPlugin of importedPlugins) {
            if (importedPlugin.isEnabled()) {
                await this.visitAndLoadPlugin(importedPlugins, loadedPlugins, new Set, importedPlugin, room);
            }
        }
        this.applyChatCommands(room);
        this.applyReactorRpcHandlers(room);
        this.applyRegisteredPrefabs(room);
    }

    /**
     * Generate a random plugin ID that has not been taken by any other plugins.
     * @returns A random plugin ID that can safely be used.
     */
    generateRandomPluginIdSafe() {
        let pluginId = PluginLoader.generateRandomPluginId();
        while (this.importedPlugins.has(pluginId)) {
            pluginId = PluginLoader.generateRandomPluginId();
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
    async importPlugin(pluginPath: string): Promise<ImportedPlugin|false> {
        const importedPlugin = await ImportedPlugin.importPlugin(this, pluginPath);        

        const ev = await this.worker.emit(
            new WorkerImportPluginEvent(importedPlugin)
        );

        if (ev.canceled)
            return false;

        if (!ev.alteredPlugin.isWorkerPlugin() && !ev.alteredPlugin.isRoomPlugin())
            throw new Error("The imported module wasn't a worker or room plugin");

        this.importedPlugins.set(ev.alteredPlugin.pluginCtr.meta.id, ev.alteredPlugin);

        Reflect.defineMetadata(hindenburgPluginDirectory, pluginPath, ev.alteredPlugin);

        return ev.alteredPlugin;
    }

    private applyChatCommands(room: Room) {
        room.chatCommandHandler.registeredCommands.clear();
        room.chatCommandHandler.registerHelpCommand();
        for (const [ , loadedPlugin ] of room.workerPlugins) {
            const pluginChatCommands = getPluginChatCommands(loadedPlugin);
            for (const chatCommand of pluginChatCommands) {
                room.chatCommandHandler.registerCommand(chatCommand.usage, chatCommand.description, chatCommand.accessCheck, chatCommand.handler.bind(loadedPlugin));
            }
        }

        for (const [ , loadedPlugin ] of room.loadedPlugins) {
            const pluginChatCommands = getPluginChatCommands(loadedPlugin);
            for (const chatCommand of pluginChatCommands) {
                room.chatCommandHandler.registerCommand(chatCommand.usage, chatCommand.description, chatCommand.accessCheck, chatCommand.handler.bind(loadedPlugin));
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

    private applyRegisteredRoles(room: Room) {
        room.registeredRoles = new Map([
            [ RoleType.Crewmate, CrewmateRole ],
            [ RoleType.Engineer, EngineerRole ],
            [ RoleType.GuardianAngel, GuardianAngelRole ],
            [ RoleType.Impostor, ImpostorRole ],
            [ RoleType.Scientist, ScientistRole ],
            [ RoleType.Shapeshifter, ShapeshifterRole ]
        ]);

        for (const [ , loadedPlugin ] of room.workerPlugins) {
            for (const registeredRole of loadedPlugin.registeredRoles) {
                room.registerRole(registeredRole);
            }
        }

        for (const [ , loadedPlugin ] of room.loadedPlugins) {
            for (const registeredRole of loadedPlugin.registeredRoles) {
                room.registerRole(registeredRole);
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
                const { messageClass: messageCtr, handler, options } = loadedPlugin.loadedMessageHandlers[i];
                const method = handler.bind(loadedPlugin);
                if (options.override) {
                    const key = `${messageCtr.messageType}:${messageCtr.messageTag}` as const;
                    const listeners = this.worker.decoder.listeners.get(key) || [];
                    this.worker.decoder.listeners.delete(key);

                    this.worker.decoder.on(messageCtr, (message, direction, ctx) => {
                        method(message, ctx, listeners.map(x => {
                            return (message: Serializable, ctx: PacketContext) => x(message, MessageDirection.Serverbound, ctx);
                        }));
                    });
                    continue;
                }

                this.worker.decoder.on(messageCtr, (message, direction, ctx) => (method as any)(message, ctx));
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
    async loadPlugin(pluginCtr: string|ImportedPlugin<typeof WorkerPlugin>): Promise<WorkerPlugin>;
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
    async loadPlugin(pluginCtr: string|ImportedPlugin<typeof RoomPlugin>, room?: Room): Promise<RoomPlugin>;
    async loadPlugin(importedPlugin: string|ImportedPlugin, room?: Room): Promise<WorkerPlugin | RoomPlugin> {
        if (typeof importedPlugin === "string") {
            const _importedPlugin = this.importedPlugins.get(importedPlugin);

            if (!_importedPlugin) {
                throw new Error("Plugin with ID '" + importedPlugin + "' not imported");
            }
            if (_importedPlugin.isRoomPlugin()) {
                return await this.loadPlugin(_importedPlugin, room);
            } else if (_importedPlugin.isWorkerPlugin()) {
                return await this.loadPlugin(_importedPlugin);
            }
            throw new Error("Plugin with ID '" + importedPlugin + "' was not a worker or a room plugin");
        }

        const defaultConfig = recursiveClone(importedPlugin.pluginCtr.meta.defaultConfig || {});
        recursiveAssign(defaultConfig, this.worker.config.plugins[importedPlugin.pluginCtr.meta.id] || {});

        if (importedPlugin.isWorkerPlugin() && room) {
            throw new Error("Attempted to load a worker plugin on a room or other non-worker object");
        } else if (importedPlugin.isRoomPlugin() && !room) {
            throw new Error("Attempted to load a room plugin on a worker or other non-room object");
        }

        const initPlugin = importedPlugin.isWorkerPlugin()
            ? importedPlugin.pluginCtr.createInstance(this.worker, defaultConfig)
            : importedPlugin.isRoomPlugin()
                ? importedPlugin.pluginCtr.createInstance(room!, defaultConfig)
                : undefined;

        if (!initPlugin)
            throw new Error("Imported plugin was neither a room plugin nor a worker plugin")

        const reactorRpcHandlers = getPluginReactorRpcHandlers(initPlugin);
        const registeredPrefabs = getPluginRegisteredPrefabs(importedPlugin.pluginCtr);
        const registeredRoles = getPluginRegisteredRoles(importedPlugin.pluginCtr);

        initPlugin.loadedReactorRpcHandlers = [...reactorRpcHandlers];
        initPlugin.registeredPrefabs = [...registeredPrefabs];
        initPlugin.registeredRoles = [...registeredRoles];

        if (importedPlugin.isRoomPlugin() && room) {
            room.loadedPlugins.set(importedPlugin.pluginCtr.meta.id, initPlugin as RoomPlugin);
            this.applyChatCommands(room);
            this.applyReactorRpcHandlers(room);
            this.applyRegisteredPrefabs(room);
            this.applyRegisteredRoles(room);

            room.logger.info("Loaded plugin: %s", initPlugin);
        }

        if (importedPlugin.isWorkerPlugin()) {
            const cliCommands = getPluginCliCommands(initPlugin);
            const messageHandlers = getPluginMessageHandlers(initPlugin);
            const registeredHttpEndpoints = getPluginHttpEndpoints(initPlugin);
            const registeredMessages = getPluginRegisteredMessages(importedPlugin.pluginCtr);

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

            initPlugin.loadedMessageHandlers = [...messageHandlers];
            initPlugin.loadedHttpEndpoints = [...registeredHttpEndpoints];
            initPlugin.loadedRegisteredMessages = [...registeredMessages];

            this.worker.loadedPlugins.set(importedPlugin.pluginCtr.meta.id, initPlugin as WorkerPlugin);

            this.applyMessageHandlers();
            this.applyRegisteredMessages();
            if (initPlugin.loadedHttpEndpoints.length && this.worker.matchmaker) {
                this.worker.matchmaker.restart();
            }

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
            this.applyRegisteredPrefabs(room);
            this.applyRegisteredRoles(room);
    
            room.logger.info("Unloaded plugin: %s", loadedPlugin);
        } else {
            this.worker.loadedPlugins.delete(pluginId);
            this.applyMessageHandlers();
            this.applyRegisteredMessages();
            if (loadedPlugin.loadedHttpEndpoints.length && this.worker.matchmaker) {
                this.worker.matchmaker.restart();
            }
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
