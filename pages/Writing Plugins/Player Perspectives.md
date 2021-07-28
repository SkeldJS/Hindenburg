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
There are 2 main things to consider when deciding whether player perspectives is
right for your plugin:
- They can be expensive for the server in memory usage, and also can affect performance
drastically if used too liberally.
- They probably won't play too well with other plugins that change the behaviour
of games.

They shouldn't be used where they would be created often, or where lots would
be created and destroyed.

### How They Work
A good way to think about player perspectives in Hindenburg is throwing players
in their own bubble where you can control what information the player hears about.

These bubbles, when created, are exact clones of the room that they are created
from. The only difference being that messages sent from these bubbles are only
sent to the players that the bubble is representing the perspectives of.

![Hindenburg Player Perspectives Diagram](https://user-images.githubusercontent.com/60631511/127015294-087b951e-80e9-4f3b-a85a-6220097d15a9.png)

Messages sent from the main room are sent to these clones through a filter, allowing
you to choose what information the player gets updated on. For example, if you
were using perspectives to change the colours of every other player for someone,
you could do the following:
```ts
const perspective = room.createPerspective(somePlayer);

perspective.incomingFilter.on([ SetColorMessage, SetNameMessage, SetHatMessage, SetPetMessage, SetSkinMessage ], message => {
    message.cancel();
});

perspective.outgoingFilter = perspective.incomingFilter;

for (const [ , player ] of perspective.players) {
    player.control?.setColor(Color.Black);
}
```

This could be extended into a debuff system where a player is unable to see the
names, colours, etc. of any other players for 10 seconds.
```ts
const perspective = room.createPerspective(somePlayer);

perspective.incomingFilter.on([ SetColorMessage, SetNameMessage, SetHatMessage, SetPetMessage, SetSkinMessage ], message => {
    message.cancel();
});

perspective.outgoingFilter = perspective.incomingFilter;

for (const [ , player ] of perspective.players) {
    player.control?.setColor(Color.Black);
    player.control?.setName("?????");
    player.control?.setHat(Hat.None);
    player.control?.setPet(Pet.None);
    player.control?.setSkin(Skin.None);
}

await sleep(10000);

perspective.destroyPerspective();
```

### Destroying Perspectives
Destroying perspectives has 3 main goals:
- Remove any references to the perspective anywhere in the original room and
in any players.
- Stop the perspective from being able to be used in any networking sense. To
avoid complications, the perspective can still be used without errors, it just
won't do anything meaningful.
- Bring the "perspective-d" player up-to-date on information that they missed out
while they were in a perspective bubble. In practice, this just means sending
information about the current state of the game, rather than trying to reverse
everything that happened in the bubble.
