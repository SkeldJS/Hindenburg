# Terminal Commands
Hindenburg provides a simple api to interface with Hindenburg's runtime terminal
interface, which uses [vorpal](https://vorpal.js.org) internally. There are some
built-in commands that are enabled by default without any plugins, see
[the CLI page](../CLI.md#built-in-commands) for more information

## Registering Commands

### Skeleton
To register a terminal command, you can use the `@CliCommand` decorator above
a method in your plugin class.

```ts
@CliCommand({
    usage: "<usage>",
    description: "<description>",
    options: [
        {
            usage: "<usage>",
            description: "<description>"
        }
    ]
})
async onMyCommand(args: any) {

}
```

`<usage>` is a string representation of how to use the command. See the [vorpal
wiki page](https://github.com/dthree/vorpal/wiki/api-|-vorpal.command#optional-arguments)
for more information.

`<description>` is a short description of what your command does, how to use it, etc.

The `options` array allows you to declare optional parameters that can be used
anywhere while running the command. They are usually prefixed with `--` for long
names or `-` for single letter aliases.

For a quick example, see the tutorialspoint page on the [cat](https://www.tutorialspoint.com/unix_commands/cat.htm)
command.

### Callback
The method below the decorator acts as a callback function for when the command
is called. Vorpal requires the function to be asynchronous (returning a promise).

The only argument that is passed to the callback function is a simple `args`, which
contains all the arguments that someone passed into your command.

See [vorpal wiki page](https://github.com/dthree/vorpal/wiki/api-|-vorpal.command#commandactionfunction)
for more information, which also has a great example of how the `args` object can
be used.