import path from "path";
import fs from "fs/promises";
import minimatch from "minimatch";
import { Worker } from "../src/worker";
import { PluginLoader, PluginPackageJson, SomePluginCtr } from "../src/handlers";

async function getPluginPackageJson(pluginPath: string): Promise<PluginPackageJson|undefined> {
    try {
        const packageJsonText = await fs.readFile(path.resolve(pluginPath, "package.json"), "utf8");
        try {
            return JSON.parse(packageJsonText) as PluginPackageJson;
        } catch (e) {
            throw new Error("Couldn't parse package.json, it must be invalid");
        }
    } catch (e: any) {
        if (e && e.code === "ENOENT") {
            return undefined;
        }

        throw e;
    }
}

export async function importPlugin(pluginPath: string) {
    if (!path.isAbsolute(pluginPath))
        throw new Error("Expected an absolute path to a plugin but got a relative one.");

    const packageJson = await getPluginPackageJson(pluginPath);
    if (packageJson && packageJson.engines && packageJson.engines.hindenburg)
        if (!minimatch(Worker.serverVersion, packageJson.engines.hindenburg))
            throw new Error("Built for an incompatible version of hindenburg");

    try {
        delete require.cache[require.resolve(pluginPath)];
    } catch (e) { // require.resolve will error if the module is not found
        throw new Error("The path didn't exist or wasn't a javascript module");
    }
    const { default: pluginCtr } = await import(pluginPath) as { default: SomePluginCtr };

    if (!PluginLoader.isHindenburgPlugin(pluginCtr))
        throw new Error("The imported module wasn't a Hindenburg plugin");

    const packageJsonMeta = {
        id: packageJson?.name || "no id",
        version: packageJson?.version || "1.0.0",
        loadOrder: packageJson?.plugin ? packageJson.plugin.loadOrder || "none" : "none",
        defaultConfig: packageJson?.plugin?.defaultConfig ? packageJson.plugin.defaultConfig : {}
    };

    if (pluginCtr.meta) {
        pluginCtr.meta = {
            id: pluginCtr.meta.id || packageJsonMeta?.id,
            version: pluginCtr.meta.version || packageJsonMeta?.version,
            loadOrder: pluginCtr.meta.loadOrder === undefined ? packageJsonMeta?.loadOrder : pluginCtr.meta.loadOrder,
            defaultConfig: pluginCtr.meta.defaultConfig || packageJsonMeta?.defaultConfig
        };
    } else {
        pluginCtr.meta = packageJsonMeta;
    }

    return pluginCtr;
}
