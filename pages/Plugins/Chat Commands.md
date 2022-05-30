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
    ctx.reply(first + " + " + second + " = " + result);
}
```

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

## The Callback
The body of the decorator, or the method that it's attached to, is called when someone uses the command in question.

The {@link ChatCommandContext | `ctx`} argument allows you to reply to the message as the server, acting simply as a wrapper for {@link Room.sendChat}. It also provides information about the player that sent the message calling the command, and the room that it came from.

The `args` argument is an object containing any arguments that the player passed into the command, mapped by the parameter name as described in [the decorator](#the-decorator). The arguments will _always_ be strings, so you must parse it yourself.

> Note that the parameter name doesn't include the surrounding `<>`s or `[]`s, or the `...` if it exists.

## On Simplicity
Note that Hindenburg does not support typical CLI features such as flags (`-p`) or switches (`/p`) or options (`--port`). This is entirely to keep chat commands as simple as possible.
