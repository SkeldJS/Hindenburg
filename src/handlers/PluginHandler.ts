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

import { Deserializable, RpcMessage, Serializable } from "@skeldjs/protocol";

import { VorpalConsole } from "../util/VorpalConsoleTransport";

import { Worker, WorkerEvents } from "../Worker";

import {
    ModdedHelloPacket,
    ReactorRpcMessage
} from "../packets";

import {
    hindenburgEventKey,
    hindenburgChatCommandDescKey,
    hindenburgChatCommandKey,
    hindenburgMessageKey,
    hindenburgRegisterMessageKey,
    MessageListenerOptions,
    hindenburgVorpalCommand,
    VorpalCommandInformation,
    BaseReactorRpcMessage
} from "../api";

import { Component, Player } from "../room";
import { ClientMod } from "../Connection";

type PluginOrder = "last"|"first"|"none"|number;

export interface PluginMeta {
    id: string;
    version: string;
    order: PluginOrder;
}

export class Plugin { // todo, maybe move eventHandlers, chatCommandHandlers etc to a seperate interface so plugins can't see those types
    static id: string;
    meta!: PluginMeta;

    logger: winston.Logger;
    
    eventHandlers: [keyof WorkerEvents, (ev: WorkerEvents[keyof WorkerEvents]) => any][];
    chatCommandHandlers: string[];
    messageHandlers: [Deserializable, (ev: Serializable) => any][];
    registeredMessages: Map<string, Map<number, Deserializable>>;  // todo: maybe switch to using sets of messages? unsure.
    registeredVorpalCommands: vorpal.Command[];

    constructor(
        public readonly worker: Worker,
        public readonly config: any
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
        this.chatCommandHandlers = [];
        this.messageHandlers = [];
        this.registeredMessages = new Map;
        this.registeredVorpalCommands = [];
    }

    async onPluginLoad?(): Promise<void>;
    async onPluginUnload?(): Promise<void>;

    async sendRpc(component: Component, rpc: BaseReactorRpcMessage, target?: Player): Promise<void> {
        for (const [ , player ] of target ? [ [ target, target ]] : component.room.players) { // cheap way to do the same thing for whether a target is specified or not
            let targetMod: ClientMod | null = null;
            for (const [ , clientMod ] of player.mods) {
                if (clientMod.modid === rpc.modId) {
                    targetMod = clientMod;
                    break;
                }
            }

            if (targetMod === null)
                continue;

            await player.sendGameData([
                new RpcMessage(
                    component.netid,
                    new ReactorRpcMessage(
                        targetMod.netid,
                        rpc
                    )
                )
            ]);
        }
    }
}

function registerMessageToMessageMap(message: Deserializable, map: Map<string, Map<number, Deserializable>>) {
    const cachedType = map.get(message.type);
    const messageType = cachedType || new Map;
    if (!cachedType)
        map.set(message.type, messageType);

    messageType.set(message.tag, message);
}

export class PluginHandler {
    loadedPlugins: Map<string, Plugin>;

    constructor(
        public readonly worker: Worker,
        public readonly pluginDir: string
    ) {
        this.loadedPlugins = new Map; 
    }

    async reregisterMessages() {
        this.worker.decoder.reset();
        this.worker.decoder.register(
            ModdedHelloPacket,
            ReactorMessage,
            ReactorHandshakeMessage,
            ReactorModDeclarationMessage
        );

        const loadedPluginsArr = [...this.loadedPlugins];
        const messagesSet: Map<string, Map<number, Deserializable>> = new Map;

        for (let i = loadedPluginsArr.length - 1; i >= 0; i--) { // iterate backwards as the last ones loaded should overwrite the first ones loaded
            const [ , loadedPlugin ] = loadedPluginsArr[i];
            for (const [ , messageTags ] of loadedPlugin.registeredMessages) {
                for (const [ , messageClass ] of messageTags) {
                    const wasSet = messagesSet.get(messageClass.type)?.get(messageClass.tag);

                    if (wasSet)
                        continue;

                    this.worker.decoder.register(messageClass);
                    registerMessageToMessageMap(messageClass, messagesSet);
                }
            }
        }
    }

    async loadPlugin(importPath: string) {
        const { default: loadedPluginCtr } = await import(importPath) as { default: typeof Plugin };

        if (typeof loadedPluginCtr !== "function")
            throw new Error("Expected default export of plugin class, got " + typeof loadedPluginCtr + ".");

        const config = this.worker.config.plugins[loadedPluginCtr.id] || {};

        if (typeof config === "boolean" && !config)
            throw new Error("Plugin is disabled.");

        if (this.loadedPlugins.get(loadedPluginCtr.id))
            await this.unloadPlugin(loadedPluginCtr.id);

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

            const eventName = Reflect.getMetadata(hindenburgEventKey, loadedPlugin, propertyName);
            
            if (eventName) {
                const fn = property.bind(loadedPlugin);
                this.worker.on(eventName, fn);
                loadedPlugin.eventHandlers.push([eventName, fn]);
            }

            const chatCommand = Reflect.getMetadata(hindenburgChatCommandKey, loadedPlugin, propertyName);
            const chatCommandDescription = Reflect.getMetadata(hindenburgChatCommandDescKey, loadedPlugin, propertyName);
            
            if (chatCommand) {
                // todo: maybe some sort of a stack system for commands that have the same trigger,
                // or allow multiple commands to have the same trigger (triggers all of them).
                const fn = property.bind(loadedPlugin);
                this.worker.chatCommandHandler.registerCommand(chatCommand, chatCommandDescription, fn);
                loadedPlugin.chatCommandHandlers.push(chatCommand);
            }

            const messageClassAndOptions = Reflect.getMetadata(hindenburgMessageKey, loadedPlugin, propertyName);
            if (messageClassAndOptions) {
                const [ messageClass, handlerOptions ] = messageClassAndOptions as [ Deserializable, MessageListenerOptions ];

                if (handlerOptions.override) {
                    // todo: handle overriding message listeners, this is difficult:
                    // must implement a "stack" system which captures the listeners
                    // of each layer of plugin added.
                }

                const fn = property.bind(loadedPlugin);
                this.worker.decoder.on(messageClass, fn);
                loadedPlugin.messageHandlers.push([ messageClass, fn ]);
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
        
        const messagesToRegister = Reflect.getMetadata(hindenburgRegisterMessageKey, loadedPluginCtr) as Set<Deserializable>|undefined;
        if (messagesToRegister) {
            for (const messageClass of messagesToRegister) {
                registerMessageToMessageMap(
                    messageClass,
                    loadedPlugin.registeredMessages
                );
            }
            this.reregisterMessages();
        }

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

        for (const [ eventName, listenerFn ] of pluginId.eventHandlers) {
            this.worker.off(eventName, listenerFn);
        }

        for (const commandName of pluginId.chatCommandHandlers) {
            this.worker.chatCommandHandler.removeCommand(commandName);
        }

        for (const vorpalCommand of pluginId.registeredVorpalCommands) {
            vorpalCommand.remove();
        }

        this.loadedPlugins.delete(pluginId.meta.id);

        this.reregisterMessages();
        this.worker.logger.info("Unloaded plugin '%s'", pluginId.meta.id);
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
            
            allImportNames.push("./" + file);
        }

        for (const importName of allImportNames) {
            try {
                const importPath = resolveFrom(this.pluginDir, importName);
                await this.loadPlugin(importPath);
            } catch (e) {
                this.worker.logger.warn("Failed to load plugin from '%s': %s", importName, e);
            }
        }
    }
}