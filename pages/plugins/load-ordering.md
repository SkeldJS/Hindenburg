Hindenburg allows you to choose in which order your plugin is ordered when it loads all plugins on server start. Of course, this means that you can't choose in what order your plugin is loaded if it's loaded manually by the server owner through the CLI, or by another plugin.

This can be helpful if you have an important message handler or event that must be registered before any other plugins, or if you're overriding the plugin loader's behaviour and want to affect any later-loaded plugins.

## Dependencies
> Check out the {@page ./dependencies.md} page for more information.

Due to technical limitations and potential paradoxes, the load ordering won't be taken into account if your plugin is dependended on by another plugin, as it will be overriden by whatever order the plugin has its dependencies listed in.

## `package.json`
In your package.json, you can specify the loadOrdering in the "plugin" section:
```json
{
    "plugin": {
        "loadOrder": "first"
    }
}
```

The value can be either, `"first"` (which is assigned a value of `-1`), `"none"` (which is assigned a value of `0`), `"last"` (which is assigned a value of `1`), or any other number for a custom ranking. Then, plugins are sorted in ascending order based on the numeric value assigned.

## `@HindenburgPlugin`
> This method is now deprecated, and will be overriden by any value in the [`package.json`](#package-json)

You can also assign a load order in the {@link HindenburgPlugin | `@HindenburgPlugin`} decorator, given the third argument:
```ts
@HindenburgPlugin("hbplugin-fun-things", "1.0.0", "first")
export class FunThingsPlugin extends WorkerPlugin {

}
```
