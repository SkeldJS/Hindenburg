import fs from "fs/promises";
import path from "path";
import winston from "winston";

import { WorkerNode } from "./WorkerNode";

export interface PluginInfo {
    name: string;
}

export interface GetPluginInfoFunction {
    (): PluginInfo;
}

export interface PluginLoadFunction {
    (server: WorkerNode, config: any): Promise<void>|void;
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
        public readonly node: WorkerNode,
        public readonly directory: string
    ) {
        this.plugins = new Map;
    }

    async loadPlugin(filename: string, config: any) {
        const pathname = path.resolve(this.directory, filename);
        const { getPluginInfo, loadPlugin, unloadPlugin } = await import(pathname) as ExportedPlugin;

        const info = await getPluginInfo();

        if (!info || !info.name) {
            this.node.logger.error(
                "PluginLoader: Failed to load plugin at %s because the information it provided was invalid.",
                path.relative(process.cwd(), pathname)
            );
            return false;
        }
        
        try {
            await loadPlugin(this.node, config);
        } catch (e) {
            this.node.logger.error(
                "PluginLoader: Failed to load plugin %s because the plugin's load function failed.",
                info.name,
                e
            );
            return false;
        }

        const plugin = new LoadedPlugin(info, unloadPlugin);
        this.plugins.set(info.name, plugin);

        this.node.logger.info(
            "PluginLoader: Loaded plugin %s.",
            info.name
        );

        return true;
    }
}