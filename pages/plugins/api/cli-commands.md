Hindenburg has an interactive CLI for server owners to interact with their servers, plugins and rooms easily, and allows plugins to extend this.

The actual API is a light layer on top of [Vorpal](http://vorpal.js.org/), which is used for the actual interface.

> Check out the {@page ../../getting-started/using-hindenburg/interactive-cli.md} page for more information.

## Custom Commands
Use the {@link CliCommand} decorator to appoint a method body as the callback for a CLI command.

### Example
A very simple example would be:
```ts
@HindenburgPlugin("hbplugin-fun-things")
export class MyPlugin extends RoomPlugin {
    @CliCommand({
        usage: "command"
    })
    async onCliCommand(args: any) {
        this.logger.info("Used command!!");
    }
}
```

_See https://github.com/dthree/vorpal/wiki/api-%7C-vorpal.command#vorpalcommandcommand-description for information
