import { CancelableEvent } from "@skeldjs/events";
import { ImportedPlugin } from "../../../handlers";

/**
 * Emitted when a plugin is imported to be loaded.
 */
export class WorkerImportPluginEvent extends CancelableEvent {
    static eventName = "worker.importplugin" as const;
    eventName = "worker.importplugin" as const;

    private _alteredPlugin: ImportedPlugin;

    constructor(
        /**
         * The plugin that has been imported.
         */
        public readonly plugin: ImportedPlugin
    ) {
        super();

        this._alteredPlugin = plugin;
    }

    /**
     * The plugin that will be imported/used instead, if altered with {@link WorkerImportPluginEvent.setPlugin}.
     */
    get alteredPlugin() {
        return this._alteredPlugin;
    }

    /**
     * Change the plugin that will be imported/used.
     * @param plugin The plugin to import/use instead.
     */
    setPlugin(plugin: ImportedPlugin) {
        this._alteredPlugin = plugin;
    }
}
