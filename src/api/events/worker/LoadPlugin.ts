import { RevertableEvent } from "@skeldjs/events";
import { Room } from "../../../worker";
import { RoomPlugin, WorkerPlugin } from "../../../handlers";

/**
 * Emitted when a plugin is loaded into the server somewhere, either in the
 * worker itself globally, or in a specific room. Use {@link WorkerLoadPluginEvent.isRoomPlugin}
 * to find out programmatically what kind of plugin has been loaded.
 *
 * If you listen for this event in your plugin, you should probably set the `order`
 * in your {@link PluginMetadata} to `"first"`.
 *
 * This is called before the {@link Plugin.onPluginLoad} lifecycle method.
 */
export class WorkerLoadPluginEvent extends RevertableEvent {
    static eventName = "worker.loadplugin" as const;
    eventName = "worker.loadplugin" as const;

    constructor(
        /**
         * The plugin that has been loaded.
         */
        public readonly plugin: WorkerPlugin|RoomPlugin,
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
    isRoomPlugin(): this is { plugin: RoomPlugin; room: Room } {
        return this.plugin instanceof RoomPlugin;
    }
}
