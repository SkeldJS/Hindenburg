Hindenburg has a great developer experience for developers, meaning you can quickly develop, test and publish plugins.

### Recommended Editors
The two recommended editors for development with Hindenburg are [VSCode](https://code.visualstudio.com/) and [WebStorm](https://www.jetbrains.com/webstorm/). Other editors may or may not work fine, but they won't be guaranteed support.

![image](https://user-images.githubusercontent.com/60631511/144727802-3adf2f70-a99d-41cd-b748-47dc791ab651.png)
_VSCode_

![image](https://user-images.githubusercontent.com/60631511/144727971-9433dcd7-4f92-4396-b789-b0707a22ed08.png)
_WebStorm_

### TypeScript
If you're using TypeScript for your plugin, make sure to build your plugin before any changes that you make. Hindenburg will import the built `/dist` directory for your plugin; not the TypeScript code.

If you're going to be making a lot of changes, it may be of use to open a separate temrinal session and use the `yarn watch` script to continuously check for changes and build incrementally:

![](https://i.imgur.com/PSd6JnS.gif)

### Using a Local Version of SkeldJS
If you're developing both Hindenburg and SkeldJS simultaneously, i.e. developing updates for SkeldJS for use in Hindenburg, you can leverage yarn's [dependency protocols](https://yarnpkg.com/features/protocols) in order to link SkeldJS:

```json
/// hindenburg/package.json
...
"dependencies": {
    "@skeldjs/client": "link:../SkeldJS/packages/client",
    "@skeldjs/constant": "link:../SkeldJS/packages/constant",
    "@skeldjs/core": "link:../SkeldJS/packages/client",
    "@skeldjs/data": "link:../SkeldJS/packages/data",
    "@skeldjs/events": "link:../SkeldJS/packages/events",
    "@skeldjs/protocol": "link:../SkeldJS/packages/protocol",
    "@skeldjs/reactor": "link:../SkeldJS/packages/reactor",
    "@skeldjs/state": "link:../SkeldJS/packages/state",
    "@skeldjs/text": "link:../SkeldJS/packages/text",
    "@skeldjs/util": "link:../SkeldJS/packages/util",
    ...
```

> Remember not to stage your updated package.json changes before committing.

Note that you'll have to build if you make any changes made to the SkeldJS packages.

### Plugin Hot-Reloading
Hindenburg allows you to unload and load plugins, meaning that you don't have to restart your server or even re-create lobbies to test plugin changes.

Checkout the load command:
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
load -hr hbplugin-customgamecode
```
