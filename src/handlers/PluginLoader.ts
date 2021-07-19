import "reflect-metadata";

import fs from "fs/promises";
import resolveFrom from "resolve-from";
import winston from "winston";
import path from "path";
import vorpal from "vorpal";
import chalk from "chalk";

import {
    ReactorHandshakeMessage,
    ReactorMessage,
    ReactorModDeclarationMessage
} from "@skeldjs/reactor";

import { Deserializable, MessageDirection, RpcMessage, Serializable } from "@skeldjs/protocol";
import { Networkable, NetworkableEvents, PlayerData } from "@skeldjs/core";

import { VorpalConsole } from "../util/VorpalConsoleTransport";

import { Worker, WorkerEvents } from "../Worker";

import {
    ModdedHelloPacket,
    ReactorRpcMessage
} from "../packets";

import {
    hindenburgEventListenersKey,
    hindenburgChatCommandKey,
    hindenburgMessageHandlersKey,
    hindenburgRegisterMessageKey,
    hindenburgVorpalCommand,
    VorpalCommandInformation,
    BaseReactorRpcMessage,
    isHindenburgPlugin,
    hindenburgReactorRpcKey,
    MessageListenerOptions
} from "../api";

import { RegisteredChatCommand } from "./ChatCommandHander";
import { Room } from "../Room";
import { recursiveAssign } from "../util/recursiveAssign";
import { recursiveClone } from "../util/recursiveClone";

type PluginOrder = "last"|"first"|"none"|number;

export interface PluginMeta {
    id: string;
    version: string;
    defaultConfig: any;
    order: PluginOrder;
}

export class Plugin {
    static meta: PluginMeta;
    meta!: PluginMeta;

    logger: winston.Logger;
    
    eventHandlers: {
        eventName: keyof WorkerEvents;
        handler: (ev: WorkerEvents[keyof WorkerEvents]) => any;
    }[];
    registeredChatCommands: RegisteredChatCommand[];
    messageHandlers: {
        messageClass: Deserializable;
        options: MessageListenerOptions;
        handler: (ev: Serializable) => any;
    }[];
    reactorRpcHandlers: {
        componentCtr: typeof Networkable;
        reactorRpc: typeof BaseReactorRpcMessage;
        handler: (component: Networkable, rpc: BaseReactorRpcMessage) => any
    }[];
    registeredMessages: Deserializable[];
    registeredVorpalCommands: vorpal.Command[];

    constructor(
        public readonly worker: Worker,
        public config: any
    ) {
        this.logger = winston.createLogger({
            transports: [
                new VorpalConsole(this.worker.vorpal, {
                    format: winston.format.combine(
                        winston.format.splat(),
                        winston.format.colorize(),
                        winston.format.printf(info => {
                            return `[${chalk.green(this.meta.id)}] ${info.level}: ${info.message}`;
                        }),
                    ),
                }),
                new winston.transports.File({
                    filename: "logs.txt",
                    format: winston.format.combine(
                        winston.format.splat(),
                        winston.format.simple()
                    )
                })
            ]
        });
        
        this.eventHandlers = [];
        this.registeredChatCommands = [];
        this.messageHandlers = [];
        this.reactorRpcHandlers = [];
        this.registeredMessages = [];
        this.registeredVorpalCommands = [];
    }

    onPluginLoad?(): any;
    onPluginUnload?(): any;

    onConfigUpdate?(): any;

    setConfig(config: any) {
        this.config = config;
        this.onConfigUpdate?.();
    }

    getConfig() {
        return this.config;
    }

    async sendReactorRpc(component: Networkable<unknown, NetworkableEvents, Room>, rpc: BaseReactorRpcMessage, target?: PlayerData): Promise<void> {
        if (!rpc.modId)
            throw new TypeError("Bad reactor rpc: invalid mod id.");

        for (const [ , player ] of target ? [ [ target, target ]] : component.room.players) { // cheap way to do the same thing for whether a target is specified or not
            const playerConnection = component.room.connections.get(player.id);

            if (playerConnection) {
                const targetMod = playerConnection.mods.get(rpc.modId);

                if (!targetMod)
                    continue;
                
                await player.room.broadcast([
                    new RpcMessage(
                        component.netid,
                        new ReactorRpcMessage(
                            targetMod.netId,
                            rpc
                        )
                    )
                ], true, player);
            }
        }
    }
}

export class PluginLoader {
    loadedPlugins: Map<string, Plugin>;
    /**
     * classname : mod id : rpc tag
     */
    reactorRpcHandlers: Map<`${string}:${string}:${number}`, Set<(component: Networkable, rpc: BaseReactorRpcMessage) => any>>;

    constructor(
        public readonly worker: Worker,
        public readonly pluginDir: string
    ) {
        this.loadedPlugins = new Map;
        this.reactorRpcHandlers = new Map;
    }

    async resetMessages() {
        const listeners = new Map([...this.worker.decoder.listeners]);
        this.worker.decoder.reset();
        this.worker.decoder.listeners = listeners;
        this.worker.decoder.register(
            ModdedHelloPacket,
            ReactorMessage,
            ReactorHandshakeMessage,
            ReactorModDeclarationMessage,
            ReactorRpcMessage
        );

        const loadedPluginsArr = [...this.loadedPlugins];
        for (const [ , loadedPlugin ] of loadedPluginsArr) {
            for (const messageClass of loadedPlugin.registeredMessages) {
                this.worker.decoder.register(messageClass);
            }
        }
    }

    async resetMessageHandlers() {
        this.worker.decoder.listeners.clear();
        this.worker.registerPacketHandlers();

        const loadedPluginsArr = [...this.loadedPlugins];
        for (const [ , loadedPlugin ] of loadedPluginsArr) {
            for (const { messageClass, handler, options } of loadedPlugin.messageHandlers) {
                if (options.override) {
                    this.worker.decoder.listeners.delete(`${messageClass.type}:${messageClass.tag}`);
                }

                this.worker.decoder.on(messageClass, handler.bind(loadedPlugin));
            }
        }
    }

    async resetChatCommands() {
        this.worker.chatCommandHandler.commands.clear();
        this.worker.chatCommandHandler.registerHelpCommand();

        for (const [ , loadedPlugin ] of this.loadedPlugins) {
            for (const registeredCommand of loadedPlugin.registeredChatCommands) {
                this.worker.chatCommandHandler.commands.set(registeredCommand.name, registeredCommand);
            }
        }
    }

    getReactorRpcHandlers(component: Networkable|typeof Networkable, rpc: BaseReactorRpcMessage|typeof BaseReactorRpcMessage) {
        const cached = this.reactorRpcHandlers.get(`${component.classname}:${rpc.modId}:${rpc.tag}`);
        const handlers = cached || new Set;

        if (!cached)
            this.reactorRpcHandlers.set(`${component.classname}:${rpc.modId}:${rpc.tag}`, handlers);

        return handlers;
    }

    async importPlugin(importPath: string) {
        const { default: loadedPluginCtr } = await import(importPath) as { default: typeof Plugin };

        if (!isHindenburgPlugin(loadedPluginCtr))
            throw new Error("Expected default export of a hindenburg plugin.");

        return loadedPluginCtr;
    }

    async loadPlugin(loadedPluginCtr: typeof Plugin) {
        const setConfig = this.worker.config.plugins[loadedPluginCtr.meta.id];
        const config = recursiveClone(loadedPluginCtr.meta.defaultConfig);
        if (setConfig && setConfig !== true) {
            recursiveAssign(config, setConfig);
        }

        if (!isHindenburgPlugin(loadedPluginCtr))
            throw new Error("Imported variable was not a hindenburg plugin.");

        if (typeof config === "boolean" && !config)
            throw new Error("Plugin is disabled.");

        if (this.loadedPlugins.get(loadedPluginCtr.meta.id))
            throw new Error("Plugin already loaded.");

        const loadedPlugin = new loadedPluginCtr(this.worker, config);

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
         * const proto = Object.getPrototypeOf(sprout);
         * console.log(Object.getPrototypeOf(proto)); // { feed() {} }
         * ```
         */
        const pluginPrototype = Object.getPrototypeOf(Object.getPrototypeOf(loadedPlugin));
        const propertyNames = Object.getOwnPropertyNames(pluginPrototype);

        for (const propertyName of propertyNames) {
            const property = pluginPrototype[propertyName] as (...args: any[]) => any;

            if (typeof property !== "function")
                continue;

            const reactorRpcClassnameModIdAndTag = Reflect.getMetadata(hindenburgReactorRpcKey, loadedPlugin, propertyName);
            if (reactorRpcClassnameModIdAndTag) {
                const { componentCtr, reactorRpc } = reactorRpcClassnameModIdAndTag;

                const fn = property.bind(loadedPlugin);
                const rpcHandlers = this.getReactorRpcHandlers(componentCtr, reactorRpc);
                rpcHandlers.add(fn);
                loadedPlugin.registeredMessages.push(reactorRpc);
                loadedPlugin.reactorRpcHandlers.push({
                    componentCtr,
                    reactorRpc,
                    handler: fn 
                });
            }

            const vorpalCommand = Reflect.getMetadata(hindenburgVorpalCommand, loadedPlugin, propertyName) as undefined|VorpalCommandInformation;
            if (vorpalCommand) {
                const command = this.worker.vorpal.command(vorpalCommand.usage, vorpalCommand.description);

                if (vorpalCommand.options) {
                    for (const option of vorpalCommand.options) {
                        command.option(option.usage, option.description || "");
                    }
                }

                const fn = property.bind(loadedPlugin);
                command.action(fn);

                loadedPlugin.registeredVorpalCommands.push(command);
            }
        }

        this.loadedPlugins.set(loadedPlugin.meta.id, loadedPlugin);

        const chatCommands = Reflect.getMetadata(hindenburgChatCommandKey, loadedPlugin);
        
        if (chatCommands) {
            for (const { usage, description, handler } of chatCommands) {
                const fn = handler.bind(loadedPlugin);
                const registeredCommand = RegisteredChatCommand.parse(usage, description, fn);
                loadedPlugin.registeredChatCommands.push(registeredCommand);
            }
            this.resetChatCommands();
        }

        const eventListeners = Reflect.getMetadata(hindenburgEventListenersKey, loadedPlugin);
        if (eventListeners) {
            for (const { eventName, handler } of eventListeners) {
                const fn = handler.bind(loadedPlugin);
                this.worker.on(eventName, fn);
                loadedPlugin.eventHandlers.push({
                    eventName,
                    handler: fn
                });
            }
        }

        const messageHandlers = Reflect.getMetadata(hindenburgMessageHandlersKey, loadedPlugin);
        if (messageHandlers) {
            loadedPlugin.messageHandlers = messageHandlers;
            this.resetMessageHandlers();
        }
        
        const messagesToRegister = Reflect.getMetadata(hindenburgRegisterMessageKey, loadedPlugin) as Set<Deserializable>|undefined;
        if (messagesToRegister) {
            for (const messageClass of messagesToRegister) {
                loadedPlugin.registeredMessages.push(messageClass);
            }
            this.resetMessages();
        }
        
        await loadedPlugin.onPluginLoad?.();
        this.worker.logger.info("Loaded plugin '%s'", loadedPlugin.meta.id);

        return loadedPlugin;
    }
    
    unloadPlugin(pluginId: string|Plugin): void {
        if (typeof pluginId === "string") {
            const plugin = this.loadedPlugins.get(pluginId);
            if (!plugin)
                throw new Error("Plugin '" + pluginId + "' not loaded.");

            return this.unloadPlugin(plugin);
        }

        for (const { eventName, handler } of pluginId.eventHandlers) {
            this.worker.off(eventName, handler);
        }

        for (const vorpalCommand of pluginId.registeredVorpalCommands) {
            vorpalCommand.remove();
        }

        for (const { componentCtr, reactorRpc, handler } of pluginId.reactorRpcHandlers) {
            const rpcHandlers = this.getReactorRpcHandlers(componentCtr, reactorRpc);
            rpcHandlers.delete(handler);
        }

        pluginId.onPluginUnload?.();
        this.loadedPlugins.delete(pluginId.meta.id);

        this.resetMessages();
        this.resetMessageHandlers();
        this.resetChatCommands();
        this.worker.logger.info("Unloaded plugin '%s'", pluginId.meta.id);
    }
    
    async loadAll() {
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

        if (this.worker.config.plugins.loadDirectory) {
            const files = await fs.readdir(this.pluginDir);
            for (const file of files) {
                if (!file.startsWith("hbplugin-"))
                    continue;
                
                allImportNames.push("./" + file);
            }
        }

        const pluginCtrs: typeof Plugin[] = [];
        for (const importName of allImportNames) {
            try {
                const importPath = resolveFrom(this.pluginDir, importName);
                const pluginCtr = await this.importPlugin(importPath);
                pluginCtrs.push(pluginCtr);
            } catch (e) {
                this.worker.logger.warn("Failed to load plugin from '%s': %s", importName, e);
            }
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

        for (const pluginCtr of pluginCtrs) {
            await this.loadPlugin(pluginCtr);
        }
    }

    resolveImportPath(importName: string) {
        try {
            const importPath = resolveFrom(this.pluginDir, importName);
            return importPath;
        } catch (e) {
            try {
                const importPath = resolveFrom(this.pluginDir, "./" + importName);
                return importPath;
            } catch (e) {
                return undefined;
            }
        }
    }
}