import { LoadBalancerNode } from "../LoadBalancerNode";
import { WorkerNode } from "../WorkerNode";

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
    clientSide: boolean;

    /**
     * Whether this plugin can be applied to the load balancer.
     */
    loadBalancer: boolean;
}

export abstract class HindenburgPlugin {
    meta!: PluginMetadata;

    constructor(public readonly server: LoadBalancerNode|WorkerNode, public readonly config?: object) {}

    abstract onPluginLoad?(): void;
    abstract onPluginUnload?(): void;
}

export interface MixinHindenburgPlugin extends HindenburgPlugin {
    id: string;
    version: string;
    description: string;
    defaultConfig: any;
    clientSide: boolean;
    loadBalancer: boolean;

    new(server: LoadBalancerNode|WorkerNode, config?: object): HindenburgPlugin;
}