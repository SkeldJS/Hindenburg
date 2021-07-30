# Player Perspectives

Individual player perspectives, in the broadest sense, allow you to execute
functions for a single player, while every other player wouldn't see a change
at all.

This could be, for example, making a player appear a colour on one player's 
screen while appearing a completely different colour on another's.

Hindenburg provides a useful API to allow you to write extremely powerful plugins
that utilise the ideas behind individual player perspectives, as well as making
sure that desync is handled correctly and prevent it from getting too out-of-control.

### When to Use Player Perspectives
Player perspectives in general should be seen as cloning the entire room, and
doing the same process for rooms when each packet is received.

Knowing this, perspectives can be expensive for the server in terms of memory 
usage _and_ performance..

They shouldn't be used in large loops, or in events that are fired often.

### How They Work
Player perspectives can be thought of as a sandbox, or a mirror of the room for
players, where nothing in that perspective has any effect on the original room
and players in that room. Only players in the perspective will see any changes.

By default, the perspective gets updated on every single thing the room gets
updated on, meaning that they essentially contain the same information and remain
that way.

It gets interesting, however, when you add filters to incoming and outgoing packets
from the perspective. This allows you to desychronise features of the room.

```ts
const perspective = room.createPerspective(somePlayer, [
    PresetFilter.GameDataUpdates
]);
```

### Example
For example, you might want to make a player get "blinded", and not be able to
tell players apart by making them all black and giving them a jumbled-up name.
Every other player, however, would see no difference at all, and the game would
continue as normal for them.

Note that filters don't block _every_ packet coming in and out, you might still
want players to move around the same way for the player as they do for everyone
else, just that their name, colours, hats, etc. give no clues to who the actual
players are.

This example can be implemented in just 12 lines of code:
```ts
const perspective = room.createPerspective(somePlayer, [
    PresetFilter.GameDataUpdates
]);

for (const [ , player ] of perspective.players) {
    const playerControl = player.control!;

    playerControl.setColor(Color.Black);
    playerControl.setName("?????");
    playerControl.setHat(Hat.None);
    playerControl.setPet(Pet.None);
    playerControl.setSkin(Skin.None);
}

await sleep(10000);

await perspective.destroyPerspective();
```

### Destroying Perspectives
Destroying a perspective by default will restore the entire room for these players,
resetting the entire room to what it should be. You can prevent this behaviour:
```ts
await perspective.destroyPerspective(false);
```

### Perspective Packet Filters
Hindenburg has some preset packet filters in the {@link PresetFilter} enum to
help you write perspectives quicker and more consicely with common use-cases.

You can pass these presets into the {@link Room.createPerspective} method:
```ts
const perspective = room.createPerspective(somePlayer, [
    PresetFilter.GameDataUpdates
]);
```

Otherwise, you can create your own filters via the `incomingFilter` and `outgoingFilter`
properties. These are instances of skeldjs' {@link PacketDecoder}, and thus have
the same API. Use `message.cancel` to prevent the message from going through.

Check out [codyphobe's wiki](https://github.com/codyphobe/among-us-protocol) if
you are unfamiliar with the among us protocol.

For example, you might want to prevent movement packets coming from the host of
the room from going through:
```ts
const perspective = room.createPerspective(somePlayer);

perspective.incomingFilter.on(DataMessage, message => {
    const netobject = perspective.netobjects.get(message.netid);

    if (
        netobject?.classname === "CustomNetworkTransform" &&
        netobject.ownerid === perspective.hostid
    ) {
        message.cancel(); // prevent this message from going through
    }
});
```

Note that by default, the incoming filter and outgoing filter are different.
Meaning that you must define a listener for both the incoming and outgoing filter
if you want it to be blocked on both.

If you're certain that they can both be the same, you can always re-assign the
outgoing filter to the the same as the incoming filter.

```ts
const perspective = room.createPerspective(somePlayer);
perspective.outgoingFilter = perspective.incomingFilter

// perspective.outgoingFilter === perspective.incomingFilter
```

Other than the above features, the API for perspectives is precisely the same as
any other room, and other than packets specified in the filters, will affect the
original room the same as executing the exact same functions on it.