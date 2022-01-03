import { RevertableEvent } from "@skeldjs/events";
import { Room } from "../../../Room";
import { PluginLoader, RoomPlugin, WorkerPlugin } from "../../../handlers";

/**
 * Emitted when a plugin is loaded into the server somewhere, either in the
 * worker itself globally, or in a specific room. Use {@link WorkerLoadPluginEvent.isRoomPlugin}
 * to find out programmatically what kind of plugin has been loaded.
 *
 * If you listen for this event in your plugin, you should probably set the `order`
 * in your {@link PluginMetadata} to `"first"`.
 */
export class WorkerLoadPluginEvent extends RevertableEvent {
    static eventName = "worker.loadplugin" as const;
    eventName = "worker.loadplugin" as const;

    constructor(
        /**
         * The plugin that has been loaded.
         */
        public readonly plugin: typeof WorkerPlugin|typeof RoomPlugin,
        /**
         * The room that this plugin has been loaded into, if the plugin is a
         * {@link RoomPlugin}.
         */
        public readonly room?: Room
    ) {
        super();
    }

    /**
     * Whether or not the plugin was a room plugin, asserts the type of
     * {@link WorkerLoadPluginEvent.plugin} and {@link WorkerLoadPluginEvent.room}.
     */
    isRoomPlugin(): this is { plugin: typeof RoomPlugin; room: Room } {
        return PluginLoader.isRoomPlugin(this.plugin);
    }
}
