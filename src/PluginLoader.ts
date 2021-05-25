import fs from "fs/promises";
import path from "path";

import { MatchmakerNode } from "./MatchmakerNode";

export interface PluginInfo {
    name: string;
    description?: string;
    defaultConfig?: any;
    loadBalancer: boolean;
}

export interface GetPluginInfoFunction {
    (): PluginInfo;
}

export interface PluginLoadFunction {
    (server: MatchmakerNode, config: any): Promise<void>|void;
}

export interface PluginUnloadFunction {
    (): Promise<void>|void;
}

export interface ExportedPlugin {
    getPluginInfo: GetPluginInfoFunction;
    loadPlugin: PluginLoadFunction;
    unloadPlugin: PluginUnloadFunction;
}

export class LoadedPlugin {
    constructor(
        public readonly info: PluginInfo,
        public readonly unload: () => Promise<void>|void
    ) {}
}

export class PluginLoader {
    plugins: Map<string, LoadedPlugin>;

    constructor(
        public readonly server: MatchmakerNode,
        public readonly directory: string
    ) {
        this.plugins = new Map;
    }

    resolveConfig(pluginId: string, info: PluginInfo) {
        const pluginsConfig = this.server.config.cluster.plugins;

        const resolvedConfig = pluginsConfig[pluginId.replace(".plugin", "")]
            ?? pluginsConfig[pluginId]
            ?? info.defaultConfig
            ?? {};

        if (resolvedConfig === true) { // Yes this is necessary
            return {};
        }

        return resolvedConfig;
    }

    async loadPlugin(pluginId: string) {
        const pathname = path.resolve(this.directory, pluginId);
        const { getPluginInfo, loadPlugin, unloadPlugin } = await import(pathname) as ExportedPlugin;

        const info = await getPluginInfo();

        if (!info || !info.name) {
            this.server.logger.error(
                "Failed to load plugin at %s because the information it provided was invalid.",
                path.relative(process.cwd(), pathname)
            );
            throw new Error("Invalid plugin information: missing 'name' field.");
        }

        if (!info.loadBalancer && this.server.isLoadBalancer()) {
            this.server.logger.warn(
                "Skipping plugin %s because it is not enabled for load balancer.",
                info.name
            );
            return false;
        }

        const resolvedConfig = this.resolveConfig(pluginId, info);

        if (!resolvedConfig) {
            return false;
        }
        
        try {
            await loadPlugin(this.server, resolvedConfig);
        } catch (e) {
            this.server.logger.error(
                "Failed to load plugin %s because the plugin's load function failed.",
                info.name,
                e
            );
            throw e;
        }

        const plugin = new LoadedPlugin(info, unloadPlugin);
        this.plugins.set(info.name, plugin);

        this.server.logger.info(
            "Loaded plugin %s.",
            info.name
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
                }
            }
        }
    }
}