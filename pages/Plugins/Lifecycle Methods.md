There are a few lifecycle methods that you can override in your plugins to listen for specific evnts.

### `constructor()`
Depending on whether you're writing a {@page Worker and Room Plugins | worker or a room} plugin, the constructor may be different to override.


For example, a worker plugin constructor:
```ts
constructor(
    public readonly worker: Worker,
    public config: any
) {
    super(worker, config);
}
```

vs a room plugin:
```ts
constructor(
    public readonly room: Room,
    public config: any
) {
    super(room, config);
}
```

The constructor lets you assign any properties on your plugin that TypeScript or JavaScript will shout at you for being unassigned. Being non-asynchronous, you should not use it for any tasks with callbacks or that return a [Promise](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise). Instead, use the [`onPluginLoad`](#onpluginload).

### `onPluginLoad()`
Very simply, this method is called when your plugin is first loaded and all events, commands and messages have been attached.

```ts
@HindenburgPlugin("hbplugin-some-plugin", "1.0.0", "none")
export default class extends WorkerPlugin {
    async onPluginLoad() {

    }
}
```

Hindenburg will wait for this method to finish if it's marked as asynchronous, so it's useful for connecting to servers or fetching resources before the server starts.

### `onPluginUnload()`
Also rather simply, this method is called when your plugin is about to be unloaded, although has not yet actually been unloaded from the server. Hindenburg will not wait for this to complete, but any asynchronous tasks can still run parallel.

```ts
@HindenburgPlugin("hbplugin-some-plugin", "1.0.0", "none")
export default class extends WorkerPlugin {
    onPluginUnload() {

    }
}
```

### `onConfigUpdate(oldConfig: any, newConfig: any)`
Called when your plugin's config in the server's `config.json` is modified, it allows you to catch when your plugin's config updates.

Useful for verifying the config, or modifying your plugin based on the new configuration.

```ts
@HindenburgPlugin("hbplugin-some-plugin", "1.0.0", "none")
export default class extends WorkerPlugin {
    onConfigUpdate(oldConfig: any, newConfig: any) {

    }
}
```
