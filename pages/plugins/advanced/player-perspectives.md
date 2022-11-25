> This is an _advanced_ topic. Adequate understand of Hindenburg & the Among Us protocol is recommended.

> This is a Server-as-a-Host _only_ topic, and although may work to a degree without it, is highily discouraged. See {@page ../../getting-started/using-hindenburg/server-as-a-host.md}.

Perspectives in Hindenburg allow you to create a virtual "playground" world to isolate players and isolate events. They allow you to run separate, but connected, games that diverge from the main game.

When perspectives are destroyed, players in the perspectives' game states are reverted back to normal.

> Note: perspectives may or may not have an impact on your servers' performance depending on how they're used. Try to limit frequent creations and destructions of them, and don't over-use filters.

## Examples
For example, you might want to create the effect of a player being "blind", where every player on their screen has all of their cosmetics removed:

![image](https://user-images.githubusercontent.com/60631511/200016485-055cd8f8-a07d-4cf0-8a18-348f421fe5fd.png)

You could write something like the following:
```ts
const perspective = room.createPerspective(player, [ PresetFilter.GameDataUpdates ]);

for (const [, player ] of perspective.players) {
    if (!player.control)
        continue;

    player.control.setName("?????");
    player.control.setColor(Color.Black);
    player.control.setHat(Hat.NoHat);
    player.control.setPet(Skin.None);
    player.control.setSkin(Skin.None);
}

await sleep(10000);

await perspective.destroyPerspective();
```

## System
### Creating perspectives
Creating perspectives work in Hindenburg by first creating an identical, but separate in memory, room that copies all of the same objects, information and config from the original.

From then on, this player is considered to be in their own room on the server, completely separate from the original one - however, it retains a reference to it. This reference is used to pass non-isolated data through the use of "filters" that determine what is isolated and what isn't.

This awful diagram shows roughly how this works:

![image](https://user-images.githubusercontent.com/60631511/200020038-7ba97b4e-d941-4551-a4ad-954b4e199a28.png)

For example, you might have a filter that prevents movement packets being shared between the two distinct rooms, thereby not allowing player in the perspective to see any movement updates from players in the original room, and no players in the original room to see any movement packets from players in the perspective.

These filters are also categorised by "incoming" and "outgoing" filters, incoming filters filter messages coming from the room into the perspective, and outgoing filters filter messages coming from the perspective into the room.

### Destroying perspectives
To destroy a perspective, Hindenburg must revert all of the changes done in the perspective while it was open. Technically, this is less of a "revert" and more of an overwrite using the original room information.

## Creating perspectives
Creating perspectives can range from being as easy as a single line to being lots more depending on what you need.

Simply use the {@link Room.createPerspective} method to create a new perspective:
```ts
const perspective = room.createPerspective(player);
```

> Note that _by default_ there are _no_ filters, meaning that the players in the perspective will experience no difference.

### Multiple Players
Perspectives can group together any number of players in their own isolated bubble, just pass an array of players into the first parameter:
```ts
const perspective = room.createPerspective([ player1, player2, player3 ]);
```

## Filters
Filters in perspectives allow you to control the flow of updates between clients, meaning you can create desync between what each client sees or how they behave.

### Preset filters
There are some built-in preset filters to make your life easier using Perspectives, without having to write your own filters:

* {@link PlayerUpdatesPerspectiveFilter} - Player information such as name, colour, hat, pet, skin, role, disconnected, dead, etc.
* {@link ChatMessagesPerspectiveFilter} - Whether or not chat messages should be synced between clients in and out of the perspective.
* {@link PositionUpdatesPerspectiveFilter} - Players' movement through walking and teleporting (i.e. vents, airship spawn)
* {@link SettingsUpdatesPerspectiveFilter} - Game settings (i.e. player vision, speed, etc.)

### Register filters
To register a filter to be used in a perspective, you must first instantiate it and then use the {@link Perspective.registerFilter} method, passing in the instantiated filter, for example:
```ts
const perspective = ctx.room.createPerspective(ctx.player);
const gameDataFilter = new PlayerUpdatesPerspectiveFilter;

perspective.registerFilter(gameDataFilter);
```

You can also make them unidirectional by passing in a {@link MessageFilterDirection}:
```ts
perspective.registerFilter(gameDataFilter, MessageFilterDirection.Outgoing); // or MessageFilterDirection.Incoming
```

### Unregister filters
If you've had enough with a filter, you can unregister it simply with:
```ts
prespective.removeFilter(gameDataFilter);
```

> You can also pass a direction, e.g. `perspective.removeFilter(gameDataFilter, MessageFilterDirection.Outgoing);`

### Custom filters
Sometimes, the preset filters won't do, so you'll have to fine-tune your filters by extending Hindenburg's {@link PerspectiveFilter} class and using {@link MessageFilter} decorators.

#### Example
```ts
export class MovingPlatformPerspectiveFilter extends PerspectiveFilter {
    @MessageFilter(UsePlatformMessage)
    protected _onMovingPlatformUpdate(message: UsePlatformMessage, perspective: Perspective, direction: MessageFilterDirection, context: PacketContext) {
        message.cancel();
    }
}
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `message` | {@link UsePlatformMessage} | The message that was received and needs to be considered by the filter |
| `perspective` | {@link Perspective} | The perspective that this message is either incoming to or outgoing from |
| `direction` | {@link MessageFilterDirection} | The direction that the message is going in, either incoming from the main room to the perspective, or outgoing from the perspective to the room |
| `context` | {@link PacketContext} | Basic information about the packet such as the sender and whether or not the message was sent reliably |

## Destroying the perspective
Destroying a perspective is as simple as calling its {@link Perspective.destroyPerspective} method:
```ts
await perspective.destroyPerspective();
```

You can also pass in whether or not to restore state of the original room back to the player in the perspective, although the default is `true`.

> Note, if restoring state is set to `false`, it could lead to some bugs and plenty of desync if not managed correctly.

## Events
There are two ways to listen to events in Perspectives.

### Event Listeners
The first and most straight-forward way is to simply attach listeners using SkeldJS' event listener system, for example:
```ts
const perspective = room.createPerspective(player);

perspective.on("player.setname", ev => {
    // someone in the perspective has set their name
});
```

Always note that perspectives, if synced with the main room, will generally fire the same events, {@page ../topics/object-ownership-guards.md with some exceptions}, so attaching listeners may just be as simple for you as `perspective.on("player.setname", this.onPlayerSetName)` if you have a plugin event listener listening on a room and want to also listen to the same event on a perspective.

### Event Targets
A nicer and more formatted way to attach listeners is using the exported `EventTarget` class, and using the `@EventListener` decorator:
```ts
export class MyPerspectiveEventTarget extends EventTarget {
    @EventListener("player.setname")
    onPlayerSetName(ev: PlayerSetNameEvent<Perspective>) {

    }
}
```
which you can then use to attach a listener:
```ts
const perspective = room.createPerspective(player);
const eventTarget = new MyPerspectiveEventTarget;

perspective.registerEventTarget(eventTarget);
```

> See {@page ../api/event-targets.md} for more information.

> This topic may or may not require knowledge of {@page ../topics/object-ownership-guards.md}, a reading of that is recommended for advanced usages of perspectives.

## API
### Get player in perspective from original room
```ts
perspective.resolvePlayer(originalPlayer);
```
_See {@link Perspective.resolvePlayer}_
