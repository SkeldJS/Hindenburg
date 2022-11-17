Dependencies for plugins are useful for ensuring that your plugin is set up in the correct way by the server owner. One common use case is having a main "api" or "auth" plugin on the worker, and having "gamemode" plugins on each room. In this case, it's important that the api plugin on the worker is loaded before the gamemode plugin.

## Registering dependencies
You can specify plugins that your plugin depends on using the {@link Dependency} decorator. This will ensure that your dependency is always loaded before your plugin, so you can access it as soon as it starts.

For example, if you want to build a house:
```ts
@Dependency("hbplugin-walls")
@HindenburgPlugin("hbplugin-roof")
export class RoofPlugin extends WorkerPlugin {
    ...
}
```

Or you can pass the plugin class itself:
```ts
@Dependency(WallsPlugin)
@HindenburgPlugin("hbplugin-roof")
export class RoofPlugin extends WorkerPlugin {
    ...
}
```

### Optional dependencies
If your dependency is optional:
```ts
@Dependency(TablePlugin, { optional: true })
@HindenburgPlugin("hbplugin-television")
export class TelevisionPlugin extends WorkerPlugin {
    ...
}
```

### Specific required version
If a plugin is updating a lot, you might want to ensure that a specific version of a plugin is installed to use it as a dependency:
```ts
@Dependency(BoilerPlugin, { version: "1.0.0" })
@HindenburgPlugin("hbplugin-radiators")
export class RadiatorsPlugin extends WorkerPlugin {
    ...
}
```

### Circular dependencies
To avoid paradoxes, Hindenburg will crash if it finds a circle of dependencies in your plugin. If you still want to require that dependency plugins exist circularly, you can do that, but you'll lose the guarantee that the dependency will be loaded before the plugin.

To do it, you'll need to assign at least one dependency in your chain as not being necessary to be loaded as soon as the plugin starts. That is, it should be loaded at some point, but it's not necessary right now.

You can do that with the `loadedBefore` option:
```ts
@Dependency(InternetPlugin)
@HindenburgPlugin("hbplugin-router")
export class RouterPlugin extends WorkerPlugin {
    ...
}
```

```ts
@Dependency(RouterPlugin, { loadedBefore: false })
@HindenburgPlugin("hbplugin-internet")
export class InternetPlugin extends WorkerPlugin {
    ...
}
```

In this example, the internet will be available before you get your router, but the internet should only really be available at all if you're going to get a router.

## Accessing dependencies
Now it's all good knowing that your dependency is loaded before your plugin, but it might not be very useful unless you can actually make use of it. Fairly simply, you can just access the {@link Worker.loadedPlugins} or {@link BaseRoom.loadedPlugins}, for example:
```ts
@Dependency("hbplugin-bad-life-decisions")
@HindenburgPlugin("hbplugin-hindenburg-disaster")
export class HindenburgDisasterPlugin extends WorkerPlugin {
    badLifeDecisions: BadLifeDecisionsPlugin;

    constructor(public readonly worker: Worker, public readonly config: any) {
        super(worker, config);

        this.badLifeDecisions = this.worker.loadedPlugins.get("hbplugin-bad-life-decisions")!;
    }
}
```

> Note that the `!` operator is used for _asserting_ that the plugin actually exists. This should be fine as Hindenburg won't load your plugin if it isn't.
