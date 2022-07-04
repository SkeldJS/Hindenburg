## Custom Logging Information
Hindenburg allows you to customise the information displayed about players, connections and rooms in Hindenburg.

Located in the {@link HindenburgConfig.logging | `logging`} area of Hindenburg's configuration, you can pass an array of keys to display about each area of Hindenburg. For example:
```json
"logging": {
    "hideSensitiveInfo": true,
    "connections": {
        "format": [
            "id",
            "language",
            "ip",
            "ping"
        ]
    },
    "rooms": {
        "format": [
            "players",
            "map"
        ]
    },
    "players": {
        "format": [
            "id",
            "ping",
            "ishost"
        ]
    }
}
```

> You can set `"hideSensitiveInfo"` to `true` to quickly hide ip addresses and user ids; useful for screenshots and public logs. Set it to `"false"` to disable this.


This would log the following
#### Connections
![image](https://user-images.githubusercontent.com/60631511/177192627-c8a2a5b6-a1ee-4ae9-9414-a8283ecc4ad6.png)

> Note that the IP is hidden, as `"hideSensitiveInfo"` is on true.

#### Rooms
![image](https://user-images.githubusercontent.com/60631511/177193258-7c2671af-adfe-4f6a-a53a-8f0a2a584088.png)

#### Players
![image](https://user-images.githubusercontent.com/60631511/177193215-265d4670-6d65-4f54-aa13-a78e070f8a8e.png)

For connections (clients connected to the server), you can use any of the following keys:
`"id"`, `"ip"`, `"ping"`, `"room"`, `"mods"`, `"level"`, `"version"`, `"platform"`, `"language"`

For rooms:
`"players"`, `"map"`, `"issaah"`, `"privacy"`

For players:
`"id"`, `"ping"`, `"mods"`, `"level"`, `"ishost"`, `"platform"`, `"language"`
