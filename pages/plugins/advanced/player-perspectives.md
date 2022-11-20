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

For very simple perspectives, such as the one above, you can use the {@link PresetFilter} enum to select one or more aspects of the game to isolate:
```ts
const perspective = room.createPerspective(player, [ PresetFilter.* ]);
```

You can also omit the filters from the list if you plan to write your own, or if you want to create a dummy perspective:
```ts
const perspective = room.createPerspective(player);
```

_{@link Room.createPerspective | See the documentation on `Room.createPerspective`}_.

### Preset filters
#### `PresetFilter.GameDataUpdates`
Isolate all updates related to cosmetics, used in the example above.

#### `PresetFilter.PositionUpdates`
Isolate all updates related to movement for players.

For example, you could make a mode where impostors, upon killing a player, gain the ability to seemingly teleport to a location.

#### `PresetFilter.SettingsUpdates`
Isolate settings updates, allowing some players to have different settings to other players. Helpful for changing individual players' movement speeds, or the number of emergency meetings they can call.

#### `PresetFilter.ChatMessages`
Isolate chat messages.

#### `PresetFilter.ObjectUpdates` _(advanced)_
Isolate updates related to spawning or despawning innernet objects.

### Unidirectional filters
You can also pass another argument to distinguish between _incoming_ filters and _outgoing_ filters.

#### Example
```ts
const perspective = room.createPerspective(player, [ ], [ PresetFilter.PositionUpdates, PresetFilter.ChatMessages ]);
```
_Acts as a "shadow ban" for players, so that their movements and chat messages aren't seen by other players._

## Multiple Players
Perspectives can group together any number of players in their own isolated bubble, just pass an array of players into the first parameter:

```ts
const perspective = new room.createPerspective([ player1, player2, player3 ], [ ...filters ]);
```

### Advanced filters
Sometimes, the preset filters won't do, so you'll have to fine-tune your filters using SkeldJS' {@link PacketDecoder} API.

You can use the {@link Perspective.incomingFilter} and {@link Perspective.outgoingFilter} separately.

> If you want to use  the same incoming filter as outgoing, simply run `perspective.incomingFilter = perspective.outgoingFilter`.

#### Example
```ts
const perspective = room.createPerspective(player, [ ]); // use no preset filters

perspective.outgoingFilter.on(DataMessage, message => { // prevent players in original room see movement from the player in the perspective
    if (message.data.byteLength !== 10)
        return;

    const netobject = perspective.netobjects.get(message.netId);

    if (netobject && netobject instanceof CustomNetworkTransform && netobject.ownerId === ctx.player.clientId) {
        message.cancel();
    }
});

perspective.outgoingFilter.on(SyncSettingsMessage, message => { // prevent player speed from affecting the original room
    message.cancel();
});

perspective.on("player.syncsettings", ev => { // prevent original room from overriding player speed
    if (ev.settings.playerSpeed !== 4) {
        ev.setSettings({ playerSpeed: 4 });
    }
});

const povPlayer = perspective.resolvePlayer(ctx.player); // get player object in the perspective

perspective.incomingFilter.on(RpcMessage, message => {
    if (message.data instanceof SnapToMessage && message.netId === povPlayer!.transform!.netId) { // don't let player in perspective see that they've been moved far away
        message.cancel();
    }
});

ctx.player.transform?.snapTo(new Vector2(20, 20), true); // move the player far away for the players in the original room

povPlayer!.control!.syncSettings(new GameSettings({ // update the perspective's player speed
    ...perspective.settings,
    playerSpeed: 4
}));

await sleep(7500);

ctx.player.transform?.snapTo(povPlayer!.transform!.position, true); // move the player to their new spot on the original room

await perspective.destroyPerspective(); // destroy the perspective, and "move" the player back to the original room
```

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
