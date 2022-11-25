Hindenburg has a great developer experience for developers, meaning you can quickly develop, test and publish plugins.

## File Structure
```
| dist
| | ...
| node_modules
| | ...
| src
| | index.ts
| | plugin.ts
| .gitignore
| config.schema.json
| index.ts
| package.json
| README.md
| tsconfig.json
| yarn.lock
```

### `dist/`
If your plugin is written in TypeScript, this is where your plugin code, [source maps](https://firefox-source-docs.mozilla.org/devtools-user/debugger/how_to/use_a_source_map/index.html) and [declaration files](https://www.typescriptlang.org/docs/handbook/declaration-files/introduction.html) go when your plugin is built into JavaScript with `yarn build`.

![image](https://user-images.githubusercontent.com/60631511/171927449-e1acad7a-d4bf-466e-814c-3933669e44a8.png)

> While code will appear here, it is _not_ for editing, see the [`/src` folder](#src).

### `node_modules/`
This folder keeps all installations of any packages your plugin has installed, including a reference to a local Hindenburg installation for development.

![image](https://user-images.githubusercontent.com/60631511/171927709-362bf7d7-4817-41e0-9d31-60dee81c41dc.png)

> Check out [this answer](https://stackoverflow.com/a/63294579) on StackOverflow to learn more about the `node_modules` folder.

### `src/`
Here your plugin code actually lives, both when writing in TypeScript and when writing in JavaScript.

![image](https://user-images.githubusercontent.com/60631511/171927809-1d0ccbba-edd0-498d-90b7-a09bebc2f703.png)

> Note: Your `/src` directory will *not* be published to NPM if you're using TypeScript.

#### `index.ts`
This file should export _everything_ from _every_ file in your plugin package.

For example:
```ts
export * from "./api";
export * from "./events";
export * from "./services";
export * from "./plugin";
```
[_(file)_](https://github.com/edqx/MouthwashGG/blob/master/hbplugin-mouthwashgg-api/src/index.ts)

#### `plugin.ts`
Contains the actual first point of access for your plugin.

For example:
```ts
import { HindenburgPlugin, WorkerPlugin } from "@skeldjs/hindenburg";

@HindenburgPlugin("hbplugin-fun-things")
export class FunThingsPlugin extends WorkerPlugin {

}
```

### `.gitignore`
If you instructed Hindenburg to create a git repository for your plugin in the template creation setup, this file makes a list of files to completely ignore when commiting changes and pushingto a remote repository.

> Check out the [Git docs on the `.gitignore` file](https://git-scm.com/docs/gitignore) for more information.

### `config.schema.json`
This follows standard [JSON Schema](https://json-schema.org) syntax and you a good way to give server owners intellisense if they're writing/updating configs in a supported editor.

> Check out the [Learn JSON Schema](https://json-schema.org/learn/getting-started-step-by-step.html) site for more information.

### `index.ts`/`index.js`
This is the entrypoint for your file, and simply exports everything from [`src/`](#src). Specifically, it exports everything from `src/` as an object export, and [your plugin](#plugin.ts) as a default export.

For example:
```ts
import { FunThingsPlugin } from "./src/plugin";

export * from "./src";
export default FunThingsPlugin;
```

> This should _always_ export your plugin as a default export.

### `package.json`
Mostly, this is used to define standard information for publishing your package to [NPM](https://npmjs.com), however it also provides Hindenburg with the location of the [entrypoint](#entrypoint) to your plugin, as well as basic plugin information, described below.

> Your package name and package version can both be used for metadata about your plugin.

> You don't _have_ to use the `package.json` for plugin metadata, see about passing additional arguments to the {@link HindenburgPlugin | `@HindenburgPlugin`} decorator.

```json
{
  "plugin": {
    "loadOrder": "none",
    "defaultConfig": {
      "message": "Hello, world!"
    }
  }
}
```

#### `loadOrder`
Defines in which order your plugin should be loaded in compared to every other plugin to be loaded when the server starts.

> See the {@page ./load-ordering.md} page for more information.

#### `defaultConfig`
Creates default configuration values to base server owner's configs off.

> See the {@page ./configuration.md} page for more information.

### `README.md`
You can use the README as an opportunity to write either a short or extensive documentation use for your plugin, including installation instructions and configuration explanations.

> Check out the [GitHub docs for Markdown](https://docs.github.com/en/get-started/writing-on-github/getting-started-with-writing-and-formatting-on-github) to learn the format.

### `tsconfig.json`/`jsconfig.json`
If you're in TypeScript, this will contain all build instructions for your plugin for TypeScript to work off of.

In both TypeScript and JavaScript, it's also used to enable features such as [Experimental Decorators](https://www.typescriptlang.org/docs/handbook/decorators.html) and emitting run-time [type information](https://github.com/rbuckton/reflect-metadata) which Hindenburg uses extensively.

For example, a `jsconfig.json`:
```ts
{
  "compilerOptions": {
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true
  }
}
```

> Check out the [docs on the `tsconfig.json` file](https://www.typescriptlang.org/docs/handbook/tsconfig-json.html) for more information.

### `yarn.lock`/`pnpm-lock.yaml`/`package-lock.json`
This is used as a _lock_ for your installed packages, ensuring that anyone who subsequently installs your packages can be confident that they have the right ones, and that they aren't malicious or otherwise invalid.

> Check out the [NPM docs for the `package-lock.json` file](https://docs.npmjs.com/cli/v8/configuring-npm/package-lock-json) for more information.

## Recommended Editors
The two recommended editors for development with Hindenburg are [VSCode](https://code.visualstudio.com/) and [WebStorm](https://www.jetbrains.com/webstorm/). Other editors may or may not work fine, but they won't be guaranteed support.

![image](https://user-images.githubusercontent.com/60631511/144727802-3adf2f70-a99d-41cd-b748-47dc791ab651.png)
_VSCode_

![image](https://user-images.githubusercontent.com/60631511/144727971-9433dcd7-4f92-4396-b789-b0707a22ed08.png)
_WebStorm_

### TypeScript
If you're using TypeScript for your plugin, make sure to build your plugin before any changes that you make. Hindenburg will import the built `/dist` directory for your plugin; not the TypeScript code.

If you're going to be making a lot of changes, it may be of use to open a separate temrinal session and use the `yarn watch` script to continuously check for changes and build incrementally:

![](https://i.imgur.com/PSd6JnS.gif)

## Plugin Hot-Reloading
Hindenburg allows you to unload and load plugins, meaning that you don't have to restart your server or even re-create lobbies to test plugin changes.

Check out the load command:
```bat
Usage: load [options] <plugin id> [room code]

  Load a plugin into the server or into the room, importing if necessary, pass 'all' into 'plugin id' to load all plugins.

  Options:

    --help        output usage information
    --hot, -h     Whether to re-import the plugin if it's already imported
    --reload, -r  Whether to reload the plugin if it's already loaded
```

For example:

```sh
load -h -r hbplugin-customgamecode
```

## Documentation
For information on specific plugin features, check out the sidebar on these docs.

For information on specific API enums, interfaces, functions, constants, classes, etc., go to the Exports section. The searchbar above can also help you look for functions that you need.

> Make sure you have the "Inherited" checkbox checked. If you're looking for Hindenburg-specific classes, make sure the "Externals" checkbox is unchecked.

And for any questions or issues, feel completely free to join the [discord server](https://discord.gg/8ewNJYmYAU), or file an [issue on the GitHub repo](https://github.com/skeldjs/Hindenburg/issues) - we're more than happy to help :)
