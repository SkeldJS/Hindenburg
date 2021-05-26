### WIP
Hindenburg is currently not in a particularly usable state, so it's recommended
not to use it right now.

# Hindenburg
Hindenburg is a completely customisable, performant and scalable Among Us
server, complete with plugins and a sophisticated and configurable anti-cheat.

It uses [SkeldJS](https://github.com/SkeldJS/SkeldJS) to interface with the
Among Us protocol, as well as keeping state.

## Features

### Plugins
Through the use of [SkeldJS](https://github.com/SkeldJS/SkeldJS), Hindenburg
has full knowledge of what is going on in a game, as well as giving you the
ability to both listen to events and modify the behaviour of the server.

### Anti-Cheat
Since Hindenburg is aware of what goes on in a game, it also features a
sophisticated anti-cheat that is highly customisable, and allows you to quickly
take down cheaters with a simple ban system.

### Reactor Support
Hindenburg also natively supports the Reactor modded handshake, allowing you to
setup the server to require or block certain mods from players.

It also allows you to force players to have the same mods and the host of the
room that they join.


## Starting
Hindenburg has both a load balancer and individual node servers.

If you are running for the first time and are yet to add a config file, run
`yarn serve:load-balancer` to write the default one.

### Redis
Currently, Hindenburg requires you to have a running instance of [Redis](https://redis.io),
this limitation is expected to go in the future.

### Load Balancer
If the current server is running as a load balancer,

The node servers do not need to be aware of the load balancer and they do not
need to be aware of each other, however the load balancer must be aware of each
node in the system.

The load balancer IP being the IP address of the server that the load server is
running on, and each node IP being the IP address of the server that that node
is running on.

### Cluster
If the current server is running as a node cluster, you will have to configure
the IP and ports to use.

The cluster IP being the IP address of the server that the cluster is running on.

### Running
In a development environment, you can run both
`yarn serve:load-balancer` and `yarn serve:cluster` to run the load balancer
and the cluster respectively. 

In a production environment, you can run both
`yarn start:load-balancer` and `yarn start:cluster` to run the load balancer
and the cluster respectively. You can use a tool like [pm2](https://npmjs.com/package/pm2)
to run these concurrently and keep them both alive in case of crashes. Make sure
that you run `yarn build` beforehand.

# Configuration
The main configuration is a JSON file called `config.json` in the current working
directory.

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

**Default:** `true`

## Anticheat

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

### `anticheat.maxConnectionsPerIp`
Allows you to set the maximum number of connections coming from one IP across all
worker nodes. Set to `0` to remove the limit.

**Default:** `0`

### `anticheat.banMessage`
The message to appear for banned clients. Can contain special symbols that will
can be replaced.

| Symbol | Description |
|--|--|
| `%s` | The time for how long the client is banned for. |
| `%i` | The anti-cheat rule that the client was banned for. |

#### Example
`You have been banned for %s for breaking '%i'`

Will be seen as

`You have been banned for 5 hours for breaking 'checkSettings'`

Although it's recommended not to include the reason for why the client was
banned.

**Default:** `"You were banned for %s for hacking."`

### Anticheat Rules
Every other property passed to the `anticheat` object is an anti-cheat rule that
can be configured simialr to eachother.

They can either be a simple boolean, where `true` says that the rule should be
enforced and the client will be disconnnected when the rule is broken, and
`false` where the rule is ignored.

They can also be an object containing more detailed information about how to
enforce the rule.

### `anticheat.*.penalty`
The penalty that the client receives for breaking this rule. Can be one of
| Penalty | Description |
|--|--|
| `ban` | Bans the client's IP for an hour unless set otherwise in `banDuration`. |
| `disconnect` | Disconnects the client immediately and kicks them from their room. |
| `ignore` | Ignore the rule. |

**Default:** `"disconnnect"`

### `anticheat.*.strikes`
The number of strikes before the client is penalised. Set to `0` to have no
strikes.

**Default:** `0`

### `anticheat.*.banDuration`
How long to ban the client for in seconds if the penalty is set to `ban`.

**Default:** `3600` (1 Hour)

A list of rules and their default scan be found in this table.
| Rule | Description | Default |
|--|--|--|
| `checkSettings` | Whether to check for invalid settings when creating a room or when updating room settings. | `true` |
| `checkObjectOwnership` | Whether to act on clients that don't own the objects they use. | `true` |
| `hostChecks` | Whether to check for clients doing host actions when they aren't the host. | `true` |
| `malformedPackets` | Whether to check for packets that result in errors that do not come naturally from official clients. | `false` |
| `invalidFlow` | Whether to act on clients doing things in the wrong order, or doing something that doesn't naturally happen. | `true` |
| `invalidName` | Whether to act on clients settings their name different to what they identified as, or if their name is too long or contains invalid characters. | `true` |
| `massivePackets` | Whether to check for packets that are too large to come from an official client. | `{ "penalty": "disconnect", "strikes": 3 }` |

## Cluster

### `cluster.name`
The name of the cluster, used as a general identifier.

**Default:** `"Cluster"`

### `cluster.ip`
The IP address of the cluster.

**Default:** `127.0.0.1`

### `cluster.ports`
An array of ports that the cluster spawns nodes to listen on.

**Default:** `[ 22123 ]`

### `cluster.plugins`
A record of plugin name to plugin configuration to use, you can also set the
plugin config to `false` to disable the plugin entirely, or set it to `true`
to use the plugin's default configuration.

**Default:** `{}`

## Load Balancer

### `loadbalancer.clusters`
An array of [clusters](#Cluster) that the load-balancer can redirect clients
to equally.

### `loadbalancer.ip`
The IP address of the load balancer.

**Default:** `"127.0.0.1"`

### `loadbalancer.port`
The port that the load balancer listens on.

**Default:** `22023`

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
        ],
        "plugins": {
            "requireHostMods": {}
        }
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
    }
}
```