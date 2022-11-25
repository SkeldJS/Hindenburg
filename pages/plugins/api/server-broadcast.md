A common way of conveying information to players is through the chat box - specifically, broadcasting messages sent by the server (or sent only to a single player), where you can choose the cosmetics of the player.

> See {@page ./chat-commands.md} for examples on how to respond to chat commands

## Send chat message
You can use the {@link BaseRoom.sendChat} method for various
```ts
@EventListener("player.syncsettings")
onSettingsUpdate(ev: PlayerSyncSettingsEvent<Room>) {
    ev.room.sendChat("Updated settings!");
}
```

## Custom appearance
The appearance of the chat message, by default, is determined by the [server's config](https://hindenburg.js.org/pages/getting-started/configuration/index.html#roomsserverplayer).

However, you can pass in values for the `sendChat` to set cosmetics:
```ts
@EventListener("player.murder")
onPlayerMurder(ev: PlayerMurderEvent<Room>) {
    if (!ev.player.playerInfo || !ev.victim.playerInfo)
        return;

    const message = ev.player.playerInfo.defaultOutfit.name + " killed " + ev.victim.playerInfo.defaultOutfit.name;
    ev.room.sendChat(message, {
        color: Color.Red,
        hatId: Hat.WizardHat
    });
}
```

## Align message
Aligning your message to either the left or the right of the chat box can be done with `side: MessageSide.*` in your `sendChat` options:
```ts
room.sendChat(message, {
    side: MessageSide.Left
});
```
_or_
```ts
room.sendChat(message, {
    side: MessageSide.Right
});
```

> Because of technical limitations, you can only send messages on the left if there is more than one player in the room.

## Recipients
You don't have to use {@page ../advanced/player-perspectives.md} to only show chat commands for certain players from the server, just pass an array of recipients in the `targets: []` array in your `sendChat` options, for example:
```ts
room.sendChat("experiencing life through he postmodern lens", {
    targets: [ room.host ]
})
```
