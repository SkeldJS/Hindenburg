To add customisability to your plugin, consider adding configuration support so that the server owner can edit values that you can access in your plugin.

## Reading config
Use your plugins' {@link Plugin.config} property to access the config that the server owner has given to your plugin:
```ts
@HindenburgPlugin("hbplugin-welcome-message")
export class WelcomeMessagePlugin extends RoomPlugin {
    @EventListener("player.setname") // use player.setname as a better indiciator for a player being "ready"
    onPlayerSetRole(ev: PlayerSetNameEvent<Room>) {
        ev.room.sendChat(this.config.message, { targets: [ ev.player ] });
    }
}
```

## Config type
If you're using [Typescript](https://www.typescriptlang.org/) with your plugin, you might be interested in creating a type for your plugins' config, so you can get proper intellisense and error reporting for it.

> Note, that this does _not_ guarantee that players will have entered valid values for your config; it only make your code better.

You can create an `interface` or `type` for your config with:
```ts
export interface WelcomeMessagePlugin {
    message: string;
}
```

## Config schema
As some editors support the use of [JSON Schemas](https://json-schema.org), Hindenburg allows you to write your own to allow plugin developers to get intellisense while writing configuration for your plugin:

![](https://i.imgur.com/E8ejhKb.gif)

This is as simple as placing a `config.schema.json` in the root of your plugin directory, and Hindenburg will automatically look for it.

> Check out https://json-schema.org/understanding-json-schema/ to learn how to write JSON schemas for your plugin.

## Default config
You can set a "default configuration" for your plugin where each key will be overriden by the server owner.

Use the `"defaultConfig"` in the `"plugin"` object in your plugin's `package.json`:
```json
"plugin": {
    "defaultConfig": {
        "message": "Hello, world!"
    }
}
```


## Listen for config updates
As the config for Hindenburg can be modified during runtime, it may be of interest to _listen_ for changes as they come through, maybe to re-listen on another port.

See the [Lifecycle Methods](https://hindenburg.js.org/pages/plugins/lifecycle-methods.html#onconfigupdateoldconfig-any-newconfig-any) page for the API reference.
