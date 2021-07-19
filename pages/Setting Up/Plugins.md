# Plugins
Hindenburg has some useful scripts that can be used to manage plugins, such as
installing, uninstalling and creating your own.

> You can use the `HINDENBURG_PLUGINS` environment variable to specify the location
of your plugins.

## Install Plugins
Install a plugin via NPM:
```sh
yarn plugins install <plugin name>
```

### Manual Install
Alternatively, if you have access to the plugin's source, you can manually install
a plugin. This is helpful if you want to run and modify your plugin in a development
environment.

You can simply copy the folder (`git clone` your repository) into your plugins
directory.

Remember to build your plugin before every change, or use typescript's [watch](https://www.typescriptlang.org/docs/handbook/configuring-watch.html)
functionality.

## Uninstall Plugins
Uninstalling and removing all references to a plugin is as simple as running
```sh
yarn plugins uninstall <plugin name>
```

Note that this command only works for commands installed via NPM, or the [`yarn
plugins install`](#install-plugins) command.

## List Installed Plugins
You can also list all of your installed plugins, both installed via NPM and those
installed manually:
```sh
yarn plugins list
```

## Creating Plugins
See the page on [Writing Plugins](https://skeldjs.github.io/Hindenburg/pages/Writing%20Plugins/Getting%20Started.html)
to learn how to start writing your own plugin.