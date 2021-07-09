# Plugin Lifecycle Methods
There are a few special lifecycle methods that you can define in your plugin class
that are executed on certain events related to your plugin. They are not event
listeners to encourage keeping them simple and short, and only to be used for
specific cases.

### `onPluginLoad()`
```ts
@HindenburgPlugin({
    id: "",
    version: "1.0.0",
    order: "none"
})
export default class extends Plugin {
    onPluginLoad() {
        // your code
    }
}
```

This method is emitted straight after your plugin is loaded. It can be made
asynchronous, and Hindenburg will wait for the function to finish. It can be
seen as just adding another step to loading your plugin, and Hindenburg will not
consider it loaded until it is complete.

This differs from the plugin's constructor, which you can also use for a similar
effect, as `onPluginLoad` is called after all events for your plugin have been
loaded, all custom protocol messages have been registered, etc.

It should ideally not be used to instantiate class properties, which should instead
be the job of the constructor:

```ts
@HindenburgPlugin({
    id: "",
    version: "1.0.0",
    order: "none"
})
export default class extends Plugin {
    constructor(worker: Worker, config: any) {
        super(worker, config);

        // your code
    }
}
```

You can override the default plugin's constructor to instantiate properties for
your plugin, onPluginLoad might make more sense to insert your code as part of
a plugin's lifecycle.

### `onPluginUnload()`
```ts
@HindenburgPlugin({
    id: "",
    version: "1.0.0",
    order: "none"
})
export default class extends Plugin {
    onPluginUnload() {
        // your code
    }
}
```

This method is called immediately before your plugin is unloaded. Hindenburg
will not wait for this method to finish if it is declared asynchronously.

It should be used to clear up any instantiated timeouts, sockets, etc, to avoid
things lingering after your plugin has been unloaded.

### `onConfigUpdate()`
```ts
@HindenburgPlugin({
    id: "",
    version: "1.0.0",
    order: "none"
})
export default class extends Plugin {
    onConfigUpdate() {
        // your code
    }
}
```

Called when the config for your plugin changes, e.g. when the server administrator
updates the Hindenburg configuration file.

Can be used to reset things for when they change, such as changing ports for a
socket.