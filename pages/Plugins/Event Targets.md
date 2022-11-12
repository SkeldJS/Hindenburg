You can create "collections" of events that you can use to freely attach to rooms and perspectives using the {@link EventTarget} API.

## Example
```ts
export class ReducedStew extends EventTarget {
    @EventListener("player.murder")
    onPlayerMurderEvent(ev: PlayerMurderEvent<Room>) {

    }
}
```

## Register Event Targets
You can use {@link BaseRoom.registerEventTarget} choose where to apply an event target:
```ts
const reducedStewTarget = new ReducedStew;

room.registerEventTarget(reducedStewTarget);
```

```ts
const perspective = room.createPerspective(player);

perspective.registerEventTarget(reducedStewTarget);
```

## Remove Event Targets
Removing an event target is as simple as calling {@link BaseRoom.removeEventTarget}:
```ts
room.removeEventTarget(reducedStewTarget);
```

For example, if you want to remove an event target when the _game ends_, you can use:
```ts
export class ReducedStew extends EventTarget {
    @EventListener("room.gameend")
    onRoomGameEnd(ev: RoomGameEndEvent) {
        ev.room.removeEventTarget(this);
    }
}
```

## Constructor
The constuctor can be anything you like, useful for creating connections to your main plugin or perspective:
```ts
export class ReducedStew extends EventTarget {
    constructor(
        public readonly myPlugin: ReducedStewPlugin
    ) {
        super();
    }
}
```

```ts
const reducedStewTarget = new ReducedStew(this);
```
