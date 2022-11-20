_Floating text_ in your servers' lobbies could be helpful to show links, display game/ server information, settings, etc.

![image](https://user-images.githubusercontent.com/60631511/201536938-a9300ebf-836d-42b5-9178-f080bcf90868.png)

The actual code is just under 3 lines long, and uses a few tricks in Among Us to get the effect running.

> This can be done entirely server-side, meaning no mods on the clients are required for this to work.

## Theory
The "fake text" effect works by abusing two facts of Among Us:
1. Players don't have to have a connection attached to them
2. Players can have any name assigned to them

In particular, the names can follow [TextMeshPro](http://digitalnativestudios.com/textmeshpro/docs/rich-text/#page), meaning we can add some styles to the text, like in the screenshot above.

## Create the plugin
Of course, you'll need to create a plugin to write your code. Have a look at the {@page ../creating-a-plugin.md} page to get started.

Or, in your Hindenburg directory, just write `yarn plugins create floating-text` in a command prompt.

## Creating the event
If you already know where you want to create your floating text, you can skip this section. Otherwise, a good place to start is simply when the game is created - or, in this case, just before the first player joins.

### Floating text property
So we can destroy the text wherever we want, such as when the game starts, we'll have to create a `textPlayer` property to reference later and assign as the fake player we'll be creating.

```ts
@HindenburgPlugin("hbplugin-floating-text")
export class FloatingTextPlugin extends RoomPlugin {
    textPlayer?: PlayerData<Room>;

    ...
}
```

> The `?` indicates that the text might not exist yet, or has been destroyed.

### Creating the text player
To listen for when the first player joins, we can use the {@link PlayerSetNameEvent | `player.setname`} event, which generally indicates that their client is ready to play.

```ts
@EventListener("room.setname")
onPlayerSetNameEvent(ev: PlayerSetNameEvent<Room>) {

}
```

Now, inside that method, we can simply call Hindenburg's handy {@link BaseRoom.createFakePlayer} method:
```ts
if (this.textPlayer)
    return;

this.textPlayer = ev.room.createFakePlayer();
```

> The check on the first line is used to quit early if the text has already been created; i.e. another player might join later and this event would get fired again.

If we connect to our room now, we'll see our fake player standing around:
![image](https://user-images.githubusercontent.com/60631511/201537669-ad5b955b-c397-4748-9cbe-ec4d9406c3b2.png)

Now, all that's left to do is to position the player and set their name to the text that we want:
```ts
this.textPlayer.control?.setName("<align=left><color=yellow><size=200%>Welcome to the underground</size></color>\nHow was the fall?" + "\n".repeat(128));
this.textPlayer.transform?.snapTo(new Vector2(-1.5, -10));
```

This should now give us:

![image](https://user-images.githubusercontent.com/60631511/201537723-96ee5df9-b24d-4465-81e2-6090bba219f2.png)

> The name can be in the format of the XML-inspired [TextMeshPro](http://digitalnativestudios.com/textmeshpro/docs/rich-text/#page) format, to give our text some style.

The `transform?.snapTo(new Vector2(-1.5, -10));` line is used to position the player underneath the lobby beyond the view range of the players. You'll have to change this position and the number of `\n`s in the `"\n".repeat(128)` line if you want to move the text down or around.

## Destroy when game starts
If you play the game now, you'll notice that the text we had stays around when the game starts:

![image](https://user-images.githubusercontent.com/60631511/201548035-e1a20f9b-17de-474e-9fcf-17c8b735a463.png)

This isn't ideal, so we can destroy the fake player simply on game start:
```ts
@EventListener("room.gamestart")
onGameStart(ev: RoomGameStartEvent<Room>) {
    if (!this.textPlayer)
        return;

    ev.room.removeFakePlayer(this.textPlayer);
}
```

> Note that the `if (!this.textPlayer)` check is just for type-safety, as `this.textPlayer` could theoretically be `undefined`.s
