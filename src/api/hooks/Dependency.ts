import "reflect-metadata";

import { SomePluginCtr } from "../../handlers";
import { ClassDecorator } from "../types";
import { isHindenburgPlugin } from "./HindenburgPlugin";

const hindenburgDependenciesKey = Symbol("hindenburg:dependencies");

export interface PluginDependencyDeclaration {
    /**
     * The id of the plugin that a plugin depends on to function fully.
     */
    pluginId: string;
    /**
     * Whether or not this dependency is optional, and the plugin can work either
     * partially or differently without it.
     * @default false
     */
    optional: boolean;
    /**
     * Whether or not the dependency must be loaded _before_ the plugin, or whether
     * it can be "lazy loaded" and simply assigned at any point.
     *
     * This is useful for allowing circular dependencies:
     *
     * ```md
     *         <-- depends on -->
     *        /====================\
     *       //                    \\
     *    ._pluginService?          V
     * MyPluginAPI            MyPluginService
     *       ^                   ._pluginApi
     *       \\                     //
     *        \=====================/
     * ```
     *
     * In this example, MyPluginApi depends on MyPluginService and MyPluginService
     * depends on MyPluginApi. Normally this would fail, however while MyPluginAPI
     * depends on MyPluginService, it doesn't necessarily have to be loaded _after_ it,
     * it can wait for it to be loaded.
     * @default true
     */
    loadedBefore: boolean;
    /**
     * The acceptable version glob of the plugin that a plugin depends on.
     *
     * Note: if {@link PluginDependencyDeclaration.optional} is enabled, the dependency
     * won't be available to the plugin (at least through the {@link Plugin.getDependency}
     * interface) if the loaded version doesn't match this version glob.
     * @default *
     */
    version: string;
}

export function Dependency(plugin: string|SomePluginCtr, options: Partial<Omit<PluginDependencyDeclaration, "pluginId">> = {}): ClassDecorator {
    if (typeof plugin !== "string" && !isHindenburgPlugin(plugin)) {
        throw new TypeError("Expected 'plugin' to be either a plugin ID or a plugin constructor.");
    }

    const pluginId = typeof plugin === "string" ? plugin : plugin.meta.id;

    return function(target: any) {
        const cachedSet: PluginDependencyDeclaration[]|undefined = Reflect.getMetadata(hindenburgDependenciesKey, target);
        const dependencies = cachedSet || [];
        if (!cachedSet) {
            Reflect.defineMetadata(hindenburgDependenciesKey, dependencies, target);
        }

        dependencies.push({ pluginId, optional: false, loadedBefore: true, version: "*",  ...options });
    };
}

export function getPluginDependencies(pluginCtr: SomePluginCtr): PluginDependencyDeclaration[] {
    return Reflect.getMetadata(hindenburgDependenciesKey, pluginCtr) || [];
}
