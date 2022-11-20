A great and easy way to allow players to communicate with your plugin is through the use of [Chat Commands](../Information/Chat%20Commands.html).

Hindenburg provides a simple, quick way to register your own custom chat commands in your plugins.

Similar to most things in Hindenburg, there's a special {@link ChatCommand | `@ChatCommand`} decorator you can use, for example:
```ts
@ChatCommand("add <first> <second>", "Add two numbers together")
onAddCommand(ctx: ChatCommandContext, args: any) {
    const first = parseFloat(args.first);
    const second = parseFloat(args.second);

    if (isNaN(first) || isNaN(second))
        return ctx.reply("Expected a number for 'first' and 'second'");

    const result = first + second;
    ctx.reply("%s + %s = %s", first, second, result);
}
```

> Note that you can pass `%s` for formatting options, where they are replaced by each next argument passed into the method.

![image](https://user-images.githubusercontent.com/60631511/143774107-36468587-b1a6-4523-bca7-17cd07c77a52.png)

![image](https://user-images.githubusercontent.com/60631511/143774137-a97f8a30-8635-4b56-a425-b11e382c6266.png)

## The Decorator
The first argument you can pass into the decorator describes the syntax of the command. The word before the first space is the name of the command, or the trigger. Anything after the first word act as parameters that players can pass into the command, parameters surrounded by `<>` means that the parameter is _required_, and parameters surrounded by `[]` means that the parameter is _optional_.

If the last argument name ends with `...` it will select the remaining text that the player passed in. (The `...` doesn't count towards the argument name).


For example:
`setname <name...>` would select anything from:
* `/setname jesus christ` - where `{ name: "jesus christ" }`
* `/setname the 1975` - where `{ name: "the 1975" }`

But wouldn't accept:
* `/setname`

This is similar to the [Command Description Syntax](https://en.wikipedia.org/wiki/Command-line_interface#Command_description_syntax) for CLI commands.

The second argument is a short, one-sentence summary of the command.

## Method Body
The body of the decorator, or the method that it's attached to, is called when someone uses the command in question.

The {@link ChatCommandContext | `ctx`} argument allows you to reply to the message as the server, acting simply as a wrapper for {@link Room.sendChat}. It also provides information about the player that sent the message calling the command, and the room that it came from.

The `args` argument is an object containing any arguments that the player passed into the command, mapped by the parameter name as described in [the decorator](#the-decorator). The arguments will _always_ be strings, so you must parse it yourself.

> Note that the parameter name doesn't include the surrounding `<>`s or `[]`s, or the `...` if it exists.

## Restrict Command to Certain Players
You can restrict how your command is accessed/shows up in the `/help` command listing through the use of short, simple **access check** functions. This is as simple as passing in a function that takes in a player that is trying to execute the command and returns a boolean (`true`/`false`),

### Example
```ts
@ChatCommand("addhost <player name...>", "Add a host to the room.", player => player.isHost)
onChat(ctx: ChatCommandContext, args: any) {
    const playerName = args["player name"];

    if (!playerName)
        return ctx.reply("Who should I make host?");

    const [ player ] = ctx.room.findPlayersWithName(args["player name"]);

    if (!player || !player.playerInfo)
        return ctx.reply("No player has a name of '" + args["player name"] + "'");

    ctx.room.addActingHost(player);
    ctx.reply("%s is now a host", player.playerInfo.defaultOutfit.name);
}
```

Notice the new function passed into `@ChatCommand`: `player => player.isHost`. This will make the command only available to host players.

Here are some more functions to filter which players can use your commands:
|                  Function                 |                    Description                 |
|-------------------------------------------|------------------------------------------------|
| `player => player.playerInfo?.isImpostor` | Only available to impostors                    |
| `player => player.playerInfo?.isDead`     | Only available to dead players                 |
| `player => !player.playerInfo?.isDead`    | Only available to alive players                |
| `player => !!player.room.meetingHud`      | Only available during meetings                 |
| `player => !!player.room.lobbyBehaviour`  | Only available during the lobby (before games) |

Adding a filter to your command will also change how the help command shows up for each player:
![image](https://user-images.githubusercontent.com/60631511/171652565-257d0c49-c90e-48c9-91f8-3a967d06cc6f.png)
_The player on the left screen is the host of the room_

Any player that attempts to use a command that isn't available to them, will be met with a notice that the command doesn't exist.

## Notes
Note that Hindenburg chat commands do not support typical CLI features such as flags (`-p`) or switches (`/p`) or options (`--port`). This is entirely to keep chat commands as simple as possible for players.
