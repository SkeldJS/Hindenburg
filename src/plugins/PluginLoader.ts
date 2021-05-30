import { EventEmitter } from "@skeldjs/events";
import { Deserializable } from "@skeldjs/protocol";
import fs from "fs/promises";
import path from "path";
import { LoadBalancerNode } from "../LoadBalancerNode";

import { MatchmakerNode } from "../MatchmakerNode";
import { WorkerNode } from "../WorkerNode";
import { EventHandlers, GlobalEventListener, GlobalEvents } from "./hooks/OnEvent";
import { MessageHandlerDecl, MessageHandlers, MessagesToRegister, PacketListener } from "./hooks/OnMessage";
import { HindenburgPlugin, HindenburgPluginCtr } from "./Plugin";

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
        public readonly directory: string
    ) {
        this.plugins = new Map;
    }

    async loadPlugin(pluginId: string) {
        const pathname = path.resolve(this.directory, pluginId);
        const { default: loadedPluginClass } = await import(pathname) as { default: HindenburgPluginCtr };

        const resolvedConfig = this.server.config.plugins[pluginId];

        if (resolvedConfig === false) {
            this.server.logger.warn("Skipping disabled plugin %s.", pluginId);
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
        const filenames = await fs.readdir(this.directory);

        for (const filename of filenames) {
            if (/\.plugin(\.(t|j)s)?$/.test(filename)) {
                try {
                    await this.loadPlugin(filename)
                } catch (e) {
                    this.server.logger.warn("Could not load plugin '%s'", filename);
                    this.server.logger.error("Error: %s", e);
                }
            }
        }
    }
}