import { EventEmitter } from "@skeldjs/events";
import { Deserializable, PacketDecoder, Serializable } from "@skeldjs/protocol";
import { Client } from "../../Client";

import { LoadBalancerNode } from "../../LoadBalancerNode";
import { WorkerNode } from "../../WorkerNode";
import { HindenburgPlugin, PluginMetadata } from "../Plugin";
import { EventHandlers, GlobalEventListener, GlobalEvents } from "./OnEvent";
import { MessageHandlers as MessageHandlers, PacketListener, MessagesToRegister, MessageHandlerDecl } from "./OnMessage";

export interface DeclarePlugin {
    server: LoadBalancerNode|WorkerNode;
}

export function DeclarePlugin(info: PluginMetadata) {
    return function<T extends { new(...args: any): {} }>(constructor: T) {
        return class extends constructor implements HindenburgPlugin {
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
        }
    }
}