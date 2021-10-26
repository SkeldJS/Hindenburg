There are 2 types of plugins that you can install or write for Hindenburg:

### Room Plugins
Room plugins attach directly to a room, and are instantiated separately for each, you can access the room directly from the plugin. They are more limited, however, and don't support some features that worker plugins do.

Room plugins can be useful for gamemodes which can be loaded by a global plugin depending on what gamemode the player wants. They generally just simplify working with rooms directly and are also faster as it is a single property access to access the room that the plugin is attached to.

```ts
@HindenburgPlugin("hbplugin-some-gamemode", "1.0.0", "none")
export default class extends RoomPlugin {
    constructor(
        public readonly room: Room,
        public readonly config: any
    ) {
        super(room, config);
    }

    @EventListener("player.setcolor")
    onPlayerSetColor(ev: PlayerSetColorEvent<Room>) {
        this.logger.info("Player %s set their color to %s",
            ev.player, Color[ev.newColor]);
    }
}
```

> Room plugins extend the `RoomPlugin` class.

### Worker Plugins
Worker plugins attach to the entire server, and listen to not only events from every room on the server, but also special events on the worker.

Worker plugins can really be used for anything else.

```ts
@HindenburgPlugin("hbplugin-some-logger", "1.0.0", "none")
export default class extends WorkerPlugin {
    constructor(
        public readonly worker: Worker,
        public readonly config: any
    ) {
        super(worker, config);
    }

    @EventListener("player.setcolor")
    onPlayerSetColor(ev: PlayerSetColorEvent<Room>) {
        this.logger.info("Player %s set their color to %s",
            ev.player, Color[ev.newColor]);
    }
}
```

> Worker plugins extend the `WorkerPlugin` class.
