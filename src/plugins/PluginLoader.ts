import fs from "fs/promises";
import path from "path";
import { LoadBalancerNode } from "../LoadBalancerNode";

import { MatchmakerNode } from "../MatchmakerNode";
import { WorkerNode } from "../WorkerNode";
import { HindenburgPlugin, MixinHindenburgPlugin } from "./Plugin";

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
        const { default: loadedPluginClass } = await import(pathname) as { default: MixinHindenburgPlugin };

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