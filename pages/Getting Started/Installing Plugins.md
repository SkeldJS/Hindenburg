Installing plugins is very simple with Hindenburg; you can either install straight from [NPM](https://npmjs.com), or manually install one via a git repository or dropping in a folder.

## Via NPM
If you want to install a plugin that is published on the [NPM](https://npmjs.com) registry, installing it is as simple as the following command:
```sh
yarn plugins install hbplugin-<plugin name>
```

For example, you could run `yarn plugins install hbplugin-ban-textfile`.

> If you need to install a specific version of the plugin, add a `@<version>` at the end of the plugin name, for example `hbplugin-ban-textfile@1.0.0`.

![plugin install example gif](https://i.imgur.com/eSx2K45.gif)

> If you want to change where your plugins install to, see the [`HINDENBURG_PLUGINS`](./Environment%20Variables#hindenburg-plugins) environment variable.

Uninstalling a plugin that you installed from NPM is as simple as:
```sh
yarn plugins uninstall hbplugin-ban-textfile
```

![](https://i.imgur.com/5ZUhmaf.gif)

## Git Repository
Hindenburg has a built-in utility to install a plugin from a git repository such as one from [Github](https://github.com):
```sh
yarn plugins import <git repository url>
```

This will handle cloning the plugin, installing dependencies with the correct package manager, building and verifying it for you.

![](https://i.imgur.com/NQB7aaO.gif)

## Manual Install
You can also simply drop plugins into any of your plugin folders and Hindenburg will automatically recognise it as a plugin and attempt to load it.

**Step 1**: Navigate to your plugins directory with the `cd` command, e.g. `cd C:/Users/essma/Documents/Projects/AmongUsProjects/Hindenburg/plugins`.

If you want to install from a git repository, such as one on [Github](https://github.com), you can simply use the `git clone` command to clone the plugin into your plugins directory For example, `git clone https://github.com/SkeldJS/hbplugin-ban-textfile`.

**Step 2**: `cd` into your plugin with `cd <repo name>`, for example `cd hbplugin-ban-textfile`

**Step 3**: `yarn`, `npm install` or `pnpm install` to install dependencies

**Step 4**: `yarn build`, `npm run build` or `pnpm run build` to build the plugin if necessary.

Hindenburg will now recognise the plugin and attempt to load it.

### TypeScript Plugins
Note that if the plugin is written in [TypeScript](https://typescriptlang.org), you will have to build the plugin manually.

Navigate to the directory of the installed plugin with the `cd` command, e.g. `cd C:/Users/essma/Documents/Projects/AmongUsProjects/Hindenburg/plugins/hbplugin-ban-textfile`

Build the plugin with `yarn build`, `npm run build` or `pnpm run build` depending on the package manager used.
