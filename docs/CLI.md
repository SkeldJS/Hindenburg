# CLI Commands

Hindenburg provides a useful and easy-to-use terminal interface while running that
you can do to interface with plugins, or use some of Hindenburg's built-in commands
for common functions.

See the page on [writing terminal commands for your plugin](./Writing%20Plugins/Terminal%20Commands.md)
if you're looking to write commands for people to interface with through this
command line.

Below is a list of built-in commands and full examples on how to use them. You can
also use the `help` command for a cheatsheet. 

## Built-In Commands

### `dc`

Forcefully disconnect a client or several clients.

Allows you to pass filters for which clients to disconnect or ban.

| Option                   | Alias | Description                                                                                                                                                                                                                |
|--------------------------|-------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `--clientid <clientid>`  | `-i`  | Client IDs of clients to disconnect, pass multiple to choose multiple clients.                                                                                                                                             |
| `--username <username>`  | `-u`  | Disconnect all clients with this username. Not necessarily their in-game name, just the one they initially identified with.                                                                                                |
| `--address <ip address>` | `-a`  | Disconnect all clients on this ip address.                                                                                                                                                                                 |
| `--room <room code>`     | `-c`  | Disconnect all clients in this room.                                                                                                                                                                                       |
| `--reason <reason>`      | `-r`  | Reason to give for disconnecting, an integer of the [DisconnectReason](https://github.com/codyphobe/among-us-protocol/blob/master/01_packet_structure/06_enums.md#disconnectreason) enum, or a string for a custom reason. |
| `--ban [duration]`       | `-b`  | Ban the clients, with an optional duration in seconds, default `3600` (1 hour)                                                                                                                                             |

For example, if you wanted to ban all players in a room that is being particularly
malicious, you could run `dc --room KLVBAD --ban` to ban them all. The room would
be closed as a result of all players leaving.

Or you might have received a report from a player and you needed to manually ban,
you might use the [`ls players OIEDXG`](#list-players-room-code) command to find the player's player id, and
used `dc -i 734 --ban 86400 -r "banned for 1 day for being annoying"` to ban that player.

### `destroy <room code>`

Destroy and remove a room from the server.

| Option              | Alias | Description                                                                                                                                                                                                                                 |
|---------------------|-------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `--reason <reason>` | `-r`  | Reason to give to clients for destroying the room, an integer of the [DisconnectReason](https://github.com/codyphobe/among-us-protocol/blob/master/01_packet_structure/06_enums.md#disconnectreason) enum, or a string for a custom reason. |

You might want to destroy a room with cheaters with suspicious behaviour if you
have the anti-cheat disabled, you could just use `destroy JKLLKM -r "please stop cheating"`.

### `load <import>`

Load a plugin by its import relative to the base plugin directory.

Allows you to load plugins without having to restart the server.

The import directory can either be an installed plugin available in the plugin
directory's `package.json`, or a folder or file in the plugin directory.

If the plugin is a folder or file, it does not need to begin with `./` to indicate
relativity.

If the plugin given is already loaded, then it re-loads the plugin, clearing the
cache and loading the new plugin if changed.

Example: `load hbplugin-my-best-plugin`

### `unload <plugin id>`

Unload a plugin.

`plugin id` being the id/name of the plugin to unload. Can also be the index of
the plugin, as returned from the [`ls plugins`](#list-something) command.

For example, `ls plugins` might return the following:
```
[worker] info: 2 plugins(s) loaded
[worker] info: 1) hbplugin-ban-textfile
[worker] info: 2) hbplugin-someplugin
```
You could either unload the `someplugin` plugin by either referencing its name
with `unload hbplugin-someplugin`, or you could reference its index by `unload 2`.

### `list <something>`

List something about the server.

`something` can be either "clients", "rooms" or "plugins". You can also use this
command with `ls` instead.

`ls clients` lists every client connected to the server.

`ls rooms` lists every room currently being hosted on the server.

`ls plugins` lists every plugin currently loaded into the server.

### `list mods <client id>`

List all of a client's mods.

You can use this command to see all of a client's mods, as the mods logged when
a client connects to the server doesn't return the full list.

For example,
```
[worker] info: Got mod from Smallbook (1, 127.0.0.1, 1ms): gg.reactor.api@1.0.0-dev
[worker] info: Got mod from Smallbook (1, 127.0.0.1, 1ms): com.sinai.unityexplorer@4.1.7
[worker] info: Got mod from Smallbook (1, 127.0.0.1, 1ms): dev.weakeyes.forcefreechat@1.0.0
[worker] info: ... Got more mods from Smallbook (1, 127.0.0.1, 1ms), use 'list mods 1' to see more
```
The logs here don't show all of the mods that Smallbook has loaded. You can use
`ls mods 1` to see the full list.
```
hindenburg~$ ls mods 1
[worker] info: Smallbook (1, 127.0.0.1, 0ms, OIEDXG) has 4 mod(s)
[worker] info: 1) gg.reactor.api@1.0.0-dev
[worker] info: 2) com.sinai.unityexplorer@4.1.7
[worker] info: 3) dev.weakeyes.forcefreechat@1.0.0
[worker] info: 4) dev.weakeyes.skipauth@1.0.0
```

### `list players <room code>`

List all players in a room.

It's hard to keep track of players in a room manually, since they might be all
over the place. This command allows you to see each player, showing basic
information about them.
```
hindenburg~$ list players aqoukt
[worker] info: 1 player(s) in AQOUKT (the skeld, 1/15 players)
[worker] info: 1) Smallbook (1, 0ms, host)
```

### `broadcast <message>`

Broadcast a message to the chat box in all rooms, or a specific room.

Note that players currently playing a game (i.e. not in the lobby or in a meeting),
won't be able to see the messages immediately.

| Option               | Alias | Description                                  |
|----------------------|-------|----------------------------------------------|
| `--room <room code>` | `-c`  | The specific room to broadcast a message to. |

For example, you might want to tell all rooms that the server is shutting down
shortly, `broadcast "Notice: server will be shutting down in 5 minutes."`.

### `mem`

View basic memory usage of the server.

This command simply takes into account created objects, and doesn't take into
account the node.js process itself, such as the garbage collector.

