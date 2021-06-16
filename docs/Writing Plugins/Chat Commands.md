# Chat Commands
Chat commands are messages prefixed with a `/` which allows players to communicate
with your plugin relatively easily without the use of any sort of mods.

For example, you might have a chat command on your plugin which allows players
to change their name after they join. A player could write in chat:

`/setname weakeyes`

To run this command, and thus a function you have setup in your plugin.

Commands are not sent to other players when they are run by players, and replies
can only be seen by the player who ran it.

## Registering Commands
Hindenburg has built-in support for these kind of commands, with a built-in
`/help` command, so there's no need to worry about players not knowing how to
run your commands.

### Skeleton
To register a global command, you can use the following general skeleton in your
plugin class:

```ts
@ChatCommand("<usage>", "<description>")
onMyCommand(ctx: ChatCommandContext, args: any) {

}
```

`<usage>` is to be replaced with a string representing how to use the command,
see below for more information.

`<description>` should be replaced by a short description of your command (what
it does, how to use it, etc.)

### Declaring Command Usage
Hindenburg allows you to declare the usage of a command using a simplfiied version
of the [standard
unix command-line command syntax](https://en.wikipedia.org/wiki/Command-line_interface#Command_description_syntax)

#### Command Name

The first part of the usage before any space or parameter declarations is used
as the name of the command (the part after the `/` to call the command).

For example, `help [command]` would mean that players could call that command using
`/help`.

#### Parameters
After the command name, you can declare parameters to your command using either
angled brackets or squared brackets to denote required and optional parameters
respectively. All optional parameters must come last, no required parameters can
follow an optional parameter.

For example, `setname <name>` would require players to specify an argument to pass
into the command, e.g. `/setname weakeyes`. Missing the argument, such as by writing
`/setname` instead, would remind the player of the usage and tell them where they
went wrong.

The `help [command]` from above uses an optional parameter, and so players can
leave it out if they desire.

Any extra parts not surrounded by `[]` or `<>` will be ignored.

#### Trailing `...`
You can also use a trailing `...` in your last parameter name to indicate that the
parameter uses "the rest of the message" as an argument.

For example, `setname <name...>` would mean that players could write `/setname yo mama`,
when without the trailing `...` it would only return the first `yo` separated by
a space.

#### To Recap:
* The first part of the usage declaration is the command name.
* Parameters surrounded by `[]` indicate an optional parameter.
* Parameters surrounded by `<>` indicate a required parameter, and cannot come
after an optional parameter.
* Parameter names ending with `...` indicate that the parameter consumes the
rest of the message, and must come last.

**Hindenburg will throw an error and your plugin will fail to load if the command
syntax is invalid.**

**Commands are purposely kept very simple to make it as easy as possible for
players to understand the commands properly, keep this in mind while writing them
yourself.**

### Callback
The function body acts as a callback function for when a player uses the command.
It takes in 2 arguments:

* A simple `context` argument consisting of information about where the command
came from and who called it, as well as supplying a useful `.reply` method to easily
reply to the command. 
* An `args` object consisting of all arguments that the player used while calling
the command.

For example, if a player wrote `/setname yo mama`, then `args` would contain:
```typescript
{
    "name": "yo mama"
}
```

## Example
The following example creates a chat command that allows players to add two numbers
together.

Note how type-checking is done in the callback rather than in Hindenburg, this
is to allow you to personalise error messages, as generalised error messages aren't
very useful for players and can be hard to understand.
```ts
@HindenburgPlugin({
    id: "hbplugin-add-command"
})
export default class {
    @ChatCommand("add <first> <second>", "Add two numbers together!")
    onAddCommand(ctx: ChatCommandContext, args: any) {
        const num1 = parseFloat(args.first);
        const num2 = parseFloat(args.second);

        if (!num1 || !num2) {
            return ctx.reply("Needs two numbers to add together!");
        }

        const result = (num1 + num2).toFixed(2);

        return ctx.reply(args.first + " + " + args.second + " = " + result);
    }
}
```

```ts
// This command is already built into Hindenburg, and simply here for display/example purposes.
@HindenburgPlugin({
    id: "hbplugin-help-command"
})
export default class {
    @ChatCommand("help [command]", "Get a list of commands and how to use them, or get help for a specific command.")
    onHelpCommand(ctx: ChatCommandContext, args: any) {
        const commands = this.worker.chatCommandHandler.commands;
        if (args.command) {
            const command = commands.get(args.command);

            if (!command) {
                await ctx.reply("No command with name: " + args.command);
                return;
            }

            await ctx.reply(
                "Usage: <color=#12a50a>"
                + command.createUsage()
                + "</color>\n\n"
                + command.description
            );
            return;
        }
        
        let outMessage = "Listing " + commands.size + " command(s):";
        for (const [ , command ] of commands) {
            outMessage += "\n\n<space=1em><color=#12a50a>"
                + command.createUsage()
                + "</color> - "
                + command.description;
        }
        await ctx.reply(outMessage);
    }
}
```