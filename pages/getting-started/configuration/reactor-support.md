Hindenburg provides official plugin support for [Reactor](https://reactor.gg), a client-side modding framework, used by many developers and public mods.

## Plugin
There's an official SkeldJS plugin for reactor support at https://github.com/SkeldJS/hbplugin-reactor.

This can be installed using the {page ../using-hindenburg/installing-plugins `yarn plugins install`} command:
```
yarn plugins install hbplugin-reactor@3
```

> Install `hbplugin-reactor@2` if your mods are still using the old reactor protocol version.

### Configuration
After installing the plugin, the following should appear in your `config.json` if you have it set up:
```json
{
    "plugins": {
        "hbplugin-reactor": {
            "enabled": true,
            "serverAsHostSyncer": false,
            "blockClientSideOnly": true,
            "mods": {},
            "allowExtraMods": true,
            "requireHostMods": true,
            "allowNormalClients": true
        }
    }
}
```

### `enabled`
Whether or not reactor support should be enabled for your server.

### `serverAsHostSyncer`
Whether or not the server should use host-based mod syncing.

> This should make virtually no difference to your server.

It's recommended to keep this at `false` if you don't know what you're doing.

### `blockClientSideOnly`
Whether or not to block players from connecting that have mods that are defined as being client-side only.

### `mods`
An object of configuration for each mod:
```json
"my.mod.id": {
    "optional": false,
    "banned": false,
    "version": "1.0.0",
    "doNetworking": false
}
```

#### `optional`
Whether or not the mod is totally optional for a client to have.

#### `banned`
Whether or not players using this mod should be blocked from playing on the server.

#### `version`
A version glob of the mod to enforce, e.g. `1.0.*` to allow any patch values.

> See [Globs on Wikipedia](https://en.wikipedia.org/wiki/Glob_(programming)) for more information on the syntax

#### `doNetworking`
Whether or not to allow this mod to have networking between clients using the same mod.

### `allowExtraMods`
Whether or not clients should be allowed to have extra mods aside from those defined in [#mods](#mods)

### `requireHostMods`
Whether or not clients connecting to a room should have the _exact_ same mods as the host of that room.

### `allowNormalClients`
Whether or not to allow non-reactor clients to connect to the server.
