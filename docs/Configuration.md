
# Configuration
The main configuration is a JSON file called `config.json` in the current working
directory.

Else, you can use the `HINDENBURG_CONFIG` environment variable to specify a custom
file location.

You can generate a default `config.json` file with the `yarn setup` command.

Below shows valid configuration properties and their default values.

## Reactor
### Example
```json
{
    "reactor": {
        "mods": {
            "tk.peasplayer.somemod": "1.0.0",
            "gg.reactor.api": "*"
        },
        "allowExtraMods": true
    }
}
```

### `reactor.mods`
A record of mod ID to mod version or configuration to allow you to set requirements
on certain mods.

The version can be a glob pattern, to allow approximate versions of mods. Passing
a version requires the client to have the mod installed and with a specific version
or version glob.

If the value is an object, it can contain properties allowing you to further
restrict the mod, for example, to ban the [CustomServersClient](https://github.com/CrowdedMods/CustomServersClient) mod.
```json
"com.andruzzzhka.customserversclient": {
    "version": "*",
    "banned": true
}
```
or to require clients to use it.
```json
"com.andruzzzhka.customserversclient": {
    "version": "1.7.0",
    "required": true
}
```
Omitting `required` would make the mod optional, although require a specific
version or version glob if it was installed.

### `reactor.mods.*.version`
The version of the mod that this server requires, if the mod is installed.

**Default:** `"*"` (Any version)

### `reactor.mods.*.required`
Whether this mod is required to play.

**Default:** `false`

### `reactor.mods.*.banned`
Whether this mod is forbidden.

**Default:** `false`

### `reactor.allowExtraMods`
Whether to allow clients to join with mods that are not defined in the `reactor.mods`
record.

### `reactor.optional`
Whether to allow non-modded clients to connect.

**Default:** `false`

## Anticheat
See the page on [HACS](https://github.com/SkeldJS/Hindenburg/blob/master/docs/HACS.md)
for information on how to configure the anticheat.

## Example
```json
{
    "checkSettings": true,
    "maxConnectionsPerIp": 0,
    "checkObjectOwnership": true,
    "hostChecks": true,
    "malformedPackets": false,
    "invalidFlow": false,
    "invalidName": true,
    "massivePackets": {
        "penalty": "disconnect",
        "strikes": 3
    }
}
```

## Cluster

### `cluster.name`
The name of the cluster, used as a general identifier.

**Default:** `"Cluster"`

### `cluster.ip`
The IP address of the cluster. Set to `auto` to auto-discover your
public ip address.

**Default:** `127.0.0.1`

### `cluster.ports`
An array of ports that the cluster spawns nodes to listen on.

**Default:** `[ 22123 ]`

## Load Balancer

### `loadbalancer.clusters`
An array of [clusters](#Cluster) that the load-balancer can redirect clients
to equally.

### `loadbalancer.ip`
The IP address of the load balancer. Set to `auto` to auto-discover your
public ip address.

**Default:** `"127.0.0.1"`

### `loadbalancer.port`
The port that the load balancer listens on.

**Default:** `22023`

## Plugins
### Example
```json
{
    "plugins": {
        "my.favourite.plugin": {
            "banForte": true
        }
    }
}
```

```json
{
    "plugins": {
        "my.favourite.plugin": false
    }
}
```

### `plugins`
A record of plugin name to plugin configuration to use, you can also set the
plugin config to `false` to disable the plugin entirely.

**Default:** `{}`

## Redis
### Example
```json
{
    "redis": {
        "host": "127.0.0.1",
        "port": 6379,
        "password": "MyFavouritePassword123"
    }
}
```

### `redis.host`
The hostname for the redis node to connect to.

**Default:** `"127.0.0.1"`

### `redis.port`
The port of the redis node to connect to.

**Default:** `6379`

### `redis.password`
The password of the redis node to connect to, omit if the server does not require
authentication.

**Default:** `(none)`

## Example Config
```json
{
    "$schema": "./misc/config.schema.json",
    "reactor": {
        "mods": {
            "gg.reactor.api": "*"
        },
        "allowExtraMods": true
    },
    "versions": ["2021.4.2"],
    "anticheat": {
        "checkSettings": true,
        "maxConnectionsPerIp": 0,
        "checkObjectOwnership": true,
        "hostChecks": true,
        "malformedPackets": false,
        "invalidFlow": false,
        "invalidName": true,
        "massivePackets": {
            "penalty": "disconnect",
            "strikes": 3
        }
    },
    "cluster": {
        "name": "Capybara",
        "ip": "127.0.0.1",
        "ports": [
            22123
        ]
    },
    "loadbalancer": {
        "clusters": [
            {
                "name": "Capybara",
                "ip": "127.0.0.1",
                "ports": [
                    22123
                ]
            }
        ],
        "ip": "127.0.0.1",
        "port": 22023
    },
    "redis": {
        "host": "127.0.0.1",
        "port": 6379
    },
    "plugins": {
        "hb.requirehostmods.plugin": {}
    }
}
```