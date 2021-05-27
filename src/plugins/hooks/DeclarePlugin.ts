import { EventEmitter } from "@skeldjs/events";
import { LoadBalancerNode } from "../../LoadBalancerNode";
import { WorkerNode } from "../../WorkerNode";
import { PluginInfo as PluginMetadata } from "../Plugin";
import { EventHandlers, GlobalEventListener, GlobalEvents } from "./Listener";

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

            loadedEvents: Map<keyof GlobalEvents, Set<GlobalEventListener>>;
    
            constructor(...args: any) {
                super(...args);
    
                this.server = args[0] as LoadBalancerNode|WorkerNode;
                this.config = args[1] ?? info.defaultConfig;

                this.meta = info;

                this.loadedEvents = new Map;
            }

            onPluginLoad() {
                const listeners = constructor.prototype[EventHandlers] as Map<keyof GlobalEvents, Set<string>>;

                if (!listeners)
                    return;

                for (const [ eventName, eventHandlers ] of listeners) {
                    const loadedEventHandlers: Set<GlobalEventListener> = new Set;
                    this.loadedEvents.set(eventName, loadedEventHandlers);
                    for (const handler of eventHandlers) {
                        (this.server as EventEmitter<GlobalEvents>).on(eventName, (this as any)[handler].bind(this));
                    }
                }
            }

            onPluginUnload() {
                for (const [ eventName, eventHandlers ] of this.loadedEvents) {
                    for (const handler of eventHandlers) {
                        (this.server as EventEmitter<GlobalEvents>).off(eventName, handler);
                    }
                }
            }
        }
    }
}