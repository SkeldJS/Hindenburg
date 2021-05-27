import { EventEmitter } from "@skeldjs/events";
import { Deserializable, PacketDecoder, Serializable } from "@skeldjs/protocol";
import { Client } from "../../Client";

import { LoadBalancerNode } from "../../LoadBalancerNode";
import { WorkerNode } from "../../WorkerNode";
import { PluginMetadata } from "../Plugin";
import { EventHandlers, GlobalEventListener, GlobalEvents } from "./OnEvent";
import { PacketHandlers as MessageHandlers, PacketListener, MessagesToRegister, MessageHandlerDecl } from "./OnMessage";

export interface DeclarePlugin {
    server: LoadBalancerNode|WorkerNode;
}

export function DeclarePlugin(info: PluginMetadata) {
    return function<T extends { new(...args: any): {} }>(constructor: T) {
        return class extends constructor {
            static id = info.id;
            static version = info.version;
            static description = info.description;
            static defaultConfig = info.defaultConfig;
            static clientSide = info.clientSide;
            static loadBalancer = info.loadBalancer;

            server: LoadBalancerNode|WorkerNode;
            config: any;
            
            meta: PluginMetadata;

            registeredMessages: Set<Deserializable>;
            loadedEventListeners: Map<keyof GlobalEvents, Set<GlobalEventListener>>;
            loadedMessageListeners: Map<Deserializable, Set<PacketListener<Deserializable>>>;
    
            constructor(...args: any) {
                super(...args);
    
                this.server = args[0] as LoadBalancerNode|WorkerNode;
                this.config = args[1] ?? info.defaultConfig;

                this.meta = info;

                this.registeredMessages = new Set;
                this.loadedEventListeners = new Map;
                this.loadedMessageListeners = new Map;
            }

            onPluginLoad() {
                const eventListeners = constructor.prototype[EventHandlers] as Map<keyof GlobalEvents, Set<string>>;

                if (eventListeners) {
                    for (const [ eventName, eventHandlers ] of eventListeners) {
                        const loadedEventHandlers: Set<GlobalEventListener> = new Set;
                        this.loadedEventListeners.set(eventName, loadedEventHandlers);
                        for (const handler of eventHandlers) {
                            const fn = (this as any)[handler].bind(this) as GlobalEventListener;
                            (this.server as EventEmitter<GlobalEvents>).on(eventName, fn);
                            loadedEventHandlers.add(fn);   
                        }
                    }
                }

                const messagesToRegister = constructor.prototype[MessagesToRegister] as Set<Deserializable>;

                if (messagesToRegister) {
                    for (const message of messagesToRegister) {
                        if (!this.server.decoder.listeners.has(message))
                            this.server.decoder.register(message);
                    }
                }

                const messageListeners = constructor.prototype[MessageHandlers] as Map<Deserializable, Set<MessageHandlerDecl>>;

                if (messageListeners) {
                    for (const [ messageClass, messageHandlers ] of messageListeners) {
                        const loadedMessageHandlers: Set<PacketListener<Deserializable>> = new Set;
                        this.loadedMessageListeners.set(messageClass, loadedMessageHandlers);
                        for (const handler of messageHandlers) {
                            if (handler.options.override) this.server.decoder.listeners.get(messageClass)?.clear();
                            const fn = (this as any)[handler.propertyName].bind(this) as PacketListener<Deserializable>;
                            this.server.decoder.on(messageClass, fn);
                            loadedMessageHandlers.add(fn);
                        }
                    }
                }
            }

            onPluginUnload() {
                for (const [ eventName, eventHandlers ] of this.loadedEventListeners) {
                    for (const handler of eventHandlers) {
                        (this.server as EventEmitter<GlobalEvents>).off(eventName, handler);
                    }
                }
                
                for (const [ messageClass, packetHandlers ] of this.loadedMessageListeners) {
                    for (const handler of packetHandlers) {
                        this.server.decoder.off(messageClass, handler);
                    }
                }
            }
        }
    }
}