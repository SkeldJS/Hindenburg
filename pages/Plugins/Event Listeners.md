One of the most central components to writing a plugin for Hindenburg is the ability to listen for specific events from rooms or from the worker.

## Attaching Listeners
As with every other Hindenburg plugin design decisions; you can attach event listeners with the {@link EventListener | `@EventListener`} decorator.

For example:
```ts
@HindenburgPlugin("hbplugin-fun-things")
export class MyPlugin extends RoomPlugin {
    @EventListener("player.setcolor")
    onPlayerSetColor(ev: PlayerSetColorEvent<Room>) {
        this.logger.info("Player %s set their color to %s",
            ev.player, Color[ev.newColor]);
    }
}
```

> You can access every symbol, `EventListener`, `PlayerSetColorEvent` and `Color` via the `@skeldjs/hindenburg` package.

Many (not all) events will allow you to cancel what would normally happen, or allow you to revert any changes that the event made. Most events also allow you to change data, for example the [`room.assignroles`](https://skeld.js.org/classes/core.RoomAssignRolesEvent.html) event allows you to modify the roles that will be assigned to players when the game starts.

Some events will also wait for any asynchronous tasks to complete.

> Be careful what you do in certain events. The [`room.fixedupdate`](https://skeld.js.org/classes/core.RoomFixedUpdateEvent.html) event, for example, can significantly slow down your server if handlers for this event take too long.

If you're writing a room plugin, only events emitted from _that_ room will be listened to. Events attached to rooms or to the worker will be detached if your plugin is unloaded.

## TypeScript
If you're working in TypeScript, due to a [long-standing issue](https://github.com/Microsoft/TypeScript/issues/4881), you must specify the type of the event, making it slightly more verbose, i.e. `ev: PlayerSendChatEvent<Room>`.

However, Hindenburg allows you to use this to your advantage, as you can omit the event name entirely from the `@EventListener()` decorator, thanks to TypeScript's ability to emit type metadata for decorators. For example, you could instead do:
```ts
@EventListener()
onPlayerSetColor(ev: PlayerSetColorEvent<Room>) {
    this.logger.info("Player %s set their color to %s",
        ev.player, Color[ev.newColor]);
}
```

## Events to Listen for
As Hindenburg is based upon [skeldjs](https://skeld.js.org), it naturally inherits every event, which you can [view here](https://skeld.js.org/pages/Information/Events.html#event-list).

Hindenburg also adds a few more events, and modifies some skeldjs ones:

### Clients
* {@link ClientBanEvent | `client.ban`}
* {@link ClientBroadcastEvent | `client.broadcast`}
* {@link ClientConnectEvent | `client.connect`}

### Rooms
* {@link ClientConnectEvent | `room.beforecreate`}
* {@link ClientConnectEvent | `room.beforedestroy`}
* {@link ClientConnectEvent | `room.create`}
* {@link ClientConnectEvent | `room.destroy`}
* {@link ClientConnectEvent | `room.gameend`}
* {@link ClientConnectEvent |  `room.gamestart`}
* {@link ClientConnectEvent | `room.selecthost`}

### Worker
* {@link WorkerBeforeJoinEvent | `worker.beforejoin`}
* {@link WorkerGetGameListEvent | `worker.getgamelist`}
* {@link WorkerImportPluginEvent | `worker.importplugin`}
* {@link WorkerLoadPluginEvent | `worker.loadplugin`}
