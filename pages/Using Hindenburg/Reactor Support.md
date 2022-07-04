Hindenburg provides native support for [Reactor](https://reactor.gg), a client-side
modding framework, used by many developers and public mods.

## Configuration
If you're running a server yourself, you'll find that Hindenburg provides great support all-round for Reactor, with configuration options to ensure players are using Reactor, *and* the correct mods, even allowing you to ban certain mods and requiring specific versions for mods that you allow.

To disable reactor and disallow it completely on your server, simply set {@link HindenburgConfig.reactor | `"reactor"`} in your config to `false`:
```json
"reactor": false
```

To enable it, either pass `true` to use default config values:
```json
"reactor": true
```
Or pass in an object with additional configuration values:
```json
"reactor": {
    "blockClientSideOnly": true,
    "mods": {},
    "allowExtraMods": true,
    "requireHostMods": false,
    "allowNormalClients": true
}
```

### `"blockClientSideOnly"`
Block any mods that are defined as being only on the client (not networked) from sending any messages. This is solely as a measure to make sure that mods correctly define what they do; best to leave this as `true`.

### `"mods"`
You can pass in an object of mod ids to configuration values in order to allow or outright ban mods - or make them optional.

For example:
```json
"reactor": {
    "mods": {
        "com.slushiegoose.townofus": {
            "optional": false,
            "banned": false,
            "version": "3.2.*",
            "doNetworking": true
        }
    }
}
```

> Set the mod to `true` to allow it if [`"allowExtraMods"`](#allowExtraMods) is set to `false`, or `false` to completely ban it.

#### `"optional"`
Specifies whether players can play without this mod completely fine. If so, then this config will be used solely to [enforce a specific version](#version) or determine [whether it is allowed to do networking](#doNetworking).

#### `"banned"`
Whether this mod is completely banned from being allowed on this server.

> Note, that this only particularly applies when [`"allowExtraMods"`](#allowExtraMods) is enabled, as otherwise only mods in [the config](#mods) would be accepted anyway.

#### `"version"`
Specify a version glob to accept specific versions of the mod.

> Check out the [wikipedia article on glob patterns](https://en.wikipedia.org/wiki/Glob_(programming)#Syntax) to learn more.

#### `"doNetworking"`
Whether or not this mod is allowed to communicate with other players with this mod.

> This could be worth setting to `"false"` if you are not entirely sure on what the mod does, as a security measure.

### `"allowExtraMods"`
Allow users to use any extra mods that they want, aside from those listed in the [`"mods"`](#mods) config.

> Note that if this is enabled, configuration listed in [`"mods"`](#mods) will be used for [enforce specific versions of mods](#version), or just to [require](#optional) or [ban](#banned) them.

### `"allowNormalClients"`
Whether or not "normal" (non-reactor) clients are allowed to connect to the server.

### `"requireHostMods"`
Joining clients must have the _exact_ same mods (including exact versions) as the host of the room.

> This also prevents non-reactor clients from joining reactor rooms, and reactor clients from joining non-reactor rooms.

## Plugin Support
Hindenburg also works great with client-side mods made with Reactor, as it provides a native reactor rpc API for plugins, allowing them to communicate directly with mods of specific players, or to entire rooms.

> Check out the {@page Working with Reactor} page to develop plugins to work with Reactor modded clients.
