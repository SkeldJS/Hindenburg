You can create "collections" of events that you can use to freely attach to rooms and perspectives using the {@link EventTarget} API.

## Example
```ts
export class ReducedStew extends EventTarget {
    @EventListener("player.murder")
    onPlayerMurderEvent(ev: PlayerMurderEvent<Room>) {

    }
}
```

You can then use {@link BaseRoom.registerEventTarget} and {@link BaseRoom.removeEventTarget} to choose where to apply it:
```ts
const reducedStewTarget = new ReducedStew;

room.registerEventTarget(reducedStew);
```

```ts
const perspective = room.createPerspective(player);

perspective.registerEventTarget(reducedStew);
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
