# Splitting Plugin Listeners
You can split up your plugin into several files for maintainability, best demonstrated by a short example.

```py
index.ts
src
 |- SetName.ts # handles players updating their name
 |- Entrypoint.ts # declares the plugin itself
```

> Note that you must **always** export your plugin as a [default export](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/export#using_the_default_export).

### `EntryPoint.ts`
```ts
@HindenburgPlugin({
    id: "hbplugin-my-plugin",
    version: "1.0.0",
    order: "none"
})
export default class extends Plugin {

}
```

### `SetName.ts`
```ts
import MyPlugin from "./Entrypoint";

export default class {
    @EventListener(MyPlugin, "player.setname")
    onPlayerSetName(ev: PlayerSetNameEvent<Room>) {

    }
}
```

### `index.ts`
```ts
import { default } from "./src/EntryPoint";
import "./src/SetName"; // You must import your separate files in some way.
```

I also have a full real-world example that uses this technique for separating
plugins: https://github.com/auproximity/hbplugin-auproximity/.