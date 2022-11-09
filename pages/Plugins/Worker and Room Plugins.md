## Worker Plugins
Worker plugins in Hindenburg are those that are attached to the worker, allowing you to listen for events regarding connections and any features that don't concern rooms rooms, as well as listen for events emitted from all rooms.

You can create a worker plugin by extending the {@link WorkerPlugin} class exported by `@skeldjs/hindenburg`, for example:
```ts
@HindenburgPlugin("hbplugin-fun-things")
export class MyPlugin extends WorkerPlugin {
    constructor(
        public readonly worker: Worker,
        public readonly config: any
    ) {
        super(worker, config);
    }
}
```

Notice how worker plugins accept a {@link Worker} object as a parameter to their constructor, while room plugins accept a {@link Room} object.

There also are some things that worker plugins allow you to do that room plugins do not, such as creating [custom CLI commands](./CLI%20Commands) and listening and registering [custom protocol messages](./Protocol%20Messages).

Also, any events, chat commands or reactor rpc handlers created on global/worker plugins will be applied to _every room created_ after the plugin is loaded, and will remain after the plugin has been unloaded, although they will no longer be applied to any new rooms.

## Room Plugins
Room plugins are plugins that are loaded on specific rooms, being properly scoped and only recieving data from the rooms that they're scoped to.

The use of room plugins can be very powerful, for instance you could mix and match gamemodes or features for specific rooms.

Room plugins can be created by extending the {@link RoomPlugin} class exported by Hindenburg, for example:
```ts
@HindenburgPlugin("hbplugin-fun-things")
export class MyPlugin extends RoomPlugin {
    constructor(
        public readonly room: Room,
        public readonly config: any
    ) {
        super(room, config);
    }
}
```

This time, the constructor accepts a {@link Room} object as its first parameter.

Room plugins are instantiated for each room, meaning you can store data on the plugin, ensured that it won't be used by multiple plugins at once.
