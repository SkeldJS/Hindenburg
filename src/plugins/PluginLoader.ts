import { EventEmitter } from "@skeldjs/events";
import { Deserializable } from "@skeldjs/protocol";
import fs from "fs/promises";
import importFrom from "import-from";
import path from "path";
import { LoadBalancerNode } from "../LoadBalancerNode";

import { MatchmakerNode } from "../MatchmakerNode";
import { WorkerNode } from "../WorkerNode";
import { EventHandlers, GlobalEventListener, GlobalEvents } from "./hooks/OnEvent";
import { MessageHandlerDecl, MessageHandlers, MessagesToRegister, PacketListener } from "./hooks/OnMessage";

export type PluginLoadOrder = "last"|"first"|"none";

export interface PluginMetadata {
    /**
     * The unique identifier for this plugin. (Usually reverse domain name format, e.g. com.example.mypackage)
     */
    id: string;

    /**
     * The version of this plugin.
     */
    version: string;

    /**
     * A short summary of this plugin.
     */
    description: string;

    /**
     * Default configuration for this plugin.
     */
    defaultConfig: any;

    /**
     * Whether this plugin requires or works with a client-side mod.
     */
    clientSide?: boolean;

    /**
     * Whether this plugin can be applied to the load balancer.
     */
    loadBalancer?: boolean;

    /**
     * The order at which this plugin should be loaded.
     */
    order?: PluginLoadOrder;
}

export abstract class HindenburgPlugin {
    meta!: PluginMetadata;

    constructor(public readonly server: LoadBalancerNode|WorkerNode, public readonly config?: object) {}

    abstract onPluginLoad?(): void;
    abstract onPluginUnload?(): void;
    
    registeredMessages!: Set<Deserializable>;
    loadedEventListeners!: Map<keyof GlobalEvents, Set<GlobalEventListener>>;
    loadedMessageListeners!: Map<Deserializable, Set<PacketListener<Deserializable>>>;
}

export interface HindenburgPluginCtr {
    id: string;
    version: string;
    description: string;
    defaultConfig: any;
    clientSide: boolean;
    loadBalancer: boolean;
    order?: PluginLoadOrder;

    new(server: LoadBalancerNode|WorkerNode, config?: object): HindenburgPlugin;
}

export interface PluginLoadFunction {
    (server: MatchmakerNode, config: any): Promise<void>|void;
}

export interface PluginUnloadFunction {
    (): Promise<void>|void;
}

export class PluginLoader {
    plugins: Map<string, HindenburgPlugin>;

    constructor(
        public readonly server: MatchmakerNode,
        public readonly pluginDirectory: string
    ) {
        this.plugins = new Map;
    }

    async resolvePluginList(pluginId: string) {
        const packageJson = await fs.readFile(
            path.resolve(this.pluginDirectory, "package.json")
        );
    }

    async loadPlugin(loadedPluginClass: HindenburgPluginCtr) {
        const resolvedConfig = this.server.config.plugins[loadedPluginClass.id];

        if (resolvedConfig === false) {
            this.server.logger.warn("Skipping disabled plugin %s.", loadedPluginClass.id);
            return false;
        }
            
        if (!loadedPluginClass.loadBalancer && this.server.isLoadBalancer()) {
            this.server.logger.warn(
                "Skipping plugin %s because it is not enabled for load balancer.",
                loadedPluginClass.id
            );
            return false;
        }

        const loadedPlugin = new loadedPluginClass(
            this.server as LoadBalancerNode|WorkerNode,
            typeof resolvedConfig === "object"
                ? resolvedConfig
                : undefined
            );
        
            
        const eventListeners = loadedPluginClass.prototype[EventHandlers] as Map<keyof GlobalEvents, Set<string>>;

        if (eventListeners) {
            for (const [ eventName, eventHandlers ] of eventListeners) {
                const loadedEventHandlers: Set<GlobalEventListener> = new Set;
                loadedPlugin.loadedEventListeners.set(eventName, loadedEventHandlers);
                for (const handler of eventHandlers) {
                    const fn = (loadedPlugin as any)[handler].bind(loadedPlugin) as GlobalEventListener;
                    (this.server as EventEmitter<GlobalEvents>).on(eventName, fn);
                    loadedEventHandlers.add(fn);   
                }
            }
        }

        const messagesToRegister = loadedPluginClass.prototype[MessagesToRegister] as Set<Deserializable>;

        if (messagesToRegister) {
            for (const message of messagesToRegister) {
                if (!this.server.decoder.listeners.has(message))
                    this.server.decoder.register(message);
            }
        }

        const messageListeners = loadedPluginClass.prototype[MessageHandlers] as Map<Deserializable, Set<MessageHandlerDecl>>;

        if (messageListeners) {
            for (const [ messageClass, messageHandlers ] of messageListeners) {
                const loadedMessageHandlers: Set<PacketListener<Deserializable>> = new Set;
                loadedPlugin.loadedMessageListeners.set(messageClass, loadedMessageHandlers);
                for (const handler of messageHandlers) {
                    if (handler.options.override) this.server.decoder.listeners.get(messageClass)?.clear();
                    const fn = (loadedPlugin as any)[handler.propertyName].bind(loadedPlugin) as PacketListener<Deserializable>;
                    this.server.decoder.on(messageClass, fn);
                    loadedMessageHandlers.add(fn);
                }
            }
        }

        try {
            await loadedPlugin.onPluginLoad?.();
        } catch (e) {
            this.server.logger.error(
                "Failed to load plugin %s because the plugin's load function failed.",
                loadedPluginClass.id,
                e
            );
            throw e;
        }

        this.plugins.set(loadedPluginClass.id, loadedPlugin);

        this.server.logger.info(
            "Loaded plugin %s.",
            loadedPluginClass.id
        );

        return true;
    }

    async unloadPlugin(pluginId: string) {
        const loadedPlugin = this.plugins.get(pluginId);

        if (!loadedPlugin)
            throw new Error("Tried to unload plguin that was not loaded.");

        for (const [ eventName, eventHandlers ] of loadedPlugin.loadedEventListeners) {
            for (const handler of eventHandlers) {
                (this.server as EventEmitter<GlobalEvents>).off(eventName, handler);
            }
        }
        
        for (const [ messageClass, packetHandlers ] of loadedPlugin.loadedMessageListeners) {
            for (const handler of packetHandlers) {
                this.server.decoder.off(messageClass, handler);
            }
        }
    }

    async loadFromDirectory() {
        const filenames = await fs.readdir(this.pluginDirectory);
        const pluginsToLoad: HindenburgPluginCtr[] = [];

        try {
            const packageJson = JSON.parse(
                await fs.readFile(
                    path.resolve(this.pluginDirectory, "package.json"),
                    "utf8"
                )
            );

            filenames.push(...Object.keys(packageJson.dependencies));
        } catch (e) {
            void e;
        }

        for (const filename of filenames) {
            if (filename.startsWith("hbplugin-")) {
                try {
                    const { default: loadedPluginClass } = importFrom(this.pluginDirectory, filename) as { default: HindenburgPluginCtr };

                    pluginsToLoad.push(loadedPluginClass);
                } catch (e) {
                    this.server.logger.warn("Could not load plugin '%s'", filename);
                    this.server.logger.error("Error: %s", e);
                }
            }
        }

        pluginsToLoad.sort((a, b) => {
            if (a.order === "first" && b.order !== "first") {
                return -1;
            }
            if (b.order === "first" && a.order !== "first") {
                return 1;
            }
            if (a.order === "last" && b.order !== "last") {
                return 1;
            }
            if (b.order === "last" && a.order !== "last") {
                return -1;
            }
            return 0;
        });

        for (const pluginClass of pluginsToLoad) {
            await this.loadPlugin(pluginClass);
        }
    }
}