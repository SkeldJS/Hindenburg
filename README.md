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
Currently, Hindenburg requires you to have a running instance of [Redis](https://https://redis.io/),
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
        "allowExtraMods": true,
        "requireHostMods": true
    }
}
```

### `reactor.mods`
A record of mod ID to mod version or configuration to allow you to set requirements
on certain mods.

The version can be a glob pattern, to allow approximate versions of mods.

The version can also be an object containing properties allowing you to further
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

### `reactor.allowExtraMods`
Whether to allow clients to join with mods that are not defined in the `reactor.mod`
record.

### `reactor.requireHostMods`
Whether or not to require clients that are joining a room to have the exact same
mods and mod versions as the host of the room.


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

**Default:** `127.0.0.1`

### `redis.port`
The port of the redis node to connect to.

**Default:** `6379`

### `redis.password`
The password of the redis node to connect to, omit if the server does not require
authentication.

**Default:** `(none)`