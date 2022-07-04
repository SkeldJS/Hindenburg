Chat commands allow players to run simple commands in the chat (similar to those from Minecraft) to communicate with plugins. This gives plugins a lot of flexibility without having to make a client mod.

> If you're a plugin developer and want to add chat commands to your plugin, check out the [Chat Commands](../Plugins/Chat%20Commands.html)

For example, players could switch gamemodes with commands with the following command:

![image](https://user-images.githubusercontent.com/60631511/143772589-e7cad6cb-b528-4b03-9f61-69465f9ed15f.png)

In Hindenburg, chat commands are designed to be as simple to use as possible, so players don't have a hard time using them.

Hindenburg also has a built-in `/help` command:

![image](https://user-images.githubusercontent.com/60631511/143772648-ed5e25b9-5420-47aa-9cbb-4af6bcee62ac.png)

## Disabling Chat Commands
To completely disable chat commands, use the {@link RoomsConfig.chatCommands | `rooms.chatCommands`} config option and set it to `false`:
```json
"rooms": {
    "chatCommands": false
}
```

## Help Command and Prefix
You can remove Hindenburg's built-in help command, for instance if you have a help manual elsewhere:
```json
"rooms": {
    "chatCommands": {
        "helpCommand": false
    }
}
```

And you can change the prefix that players use to specify a command call, for example allowing players to use `!help` instead of `/help`:
```json
"rooms": {
    "chatCommands": {
        "prefix": "!"
    }
}
```

> The prefix can be any length, although it's best to keep it short for being able to write shorthand.

## Chat Commands and Plugins
Hindenburg provides a great and simple API for registering chat commands as a plugin, [check out the guide on registering custom chat commands for more information](../Plugins/Chat%20Commands.html).
