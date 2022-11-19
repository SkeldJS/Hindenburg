By default, Hindenburg only supports known objects in Among Us. Objects in Among Us, short for **Innernet Object**, are representations of parts of Among Us games that are designed to be networked between players. They are created by the host, and can either be for a _player_, or for the entire room itself. Objects can have child objects that can be spawned alongside them, making a set of these a _prefab_.

For example, a **PlayerControl** object can be spawned, owned by a player, and has two child objects: **PlayerPhysics** and **CustomNetworkTransform**.

Each prefab is identified by a hard-coded spawn type.

> See the {@link SpawnType} enum for the values.

## Custom Objects
Hindenburg does, however, allow you to run your server to support any custom objects that clients may use.

> Note that since objects are a host-operation, you will need to disable {@page ../using-hindenburg/server-as-a-host.md} for this. Alternatively, check out the {@page ../../plugins/advanced/custom-innernet-objects.md} to be able to write your own host-logic for your objects on the server.

Through the {@link AdvancedRoomOptions} room configuration:
```json
"rooms": {
    "advanced": {
        "unknownObjects": [ <spawn type> ]
    }
}
```

The items in the array can be either a _number_, representing a custom {@link SpawnType} value for the object, or a _string_, representing a key in the {@link SpawnType}.


### Example - Submerged
For example, if you want to have full support for the [Submerged](https://github.com/SubmergedAmongUs/Submerged) custom Among Us map:
```json
"advanced": {
    "unknownObjects": [ 9 ]
}
```

or alternatively, the general:
```json
"advanced": {
    "unknownObjects": true
}
```

> If you're not sure what spawn type value you're looking for, as with the `9` for Submerged above, simply set `"unknownObjects"` to `true`

## Plugins
As these objects will be incompatible with Server-as-a-Host, Hindenburg also allows you (or plugin developers) to write the host logic for custom/modded objects on the server, allowing Server-as-a-Host to function correctly.

Check out the {@page ../../plugins/advanced/custom-innernet-objects.md} page for more information.
