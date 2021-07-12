# Installing Plugins
There are 2 ways to install plugins with Hindenburg:
* [Install through NPM](#install-through-npm)
* [Manual install](#manual-install)

# Install Through NPM
Plugin developers can publish their plugins to the [npm](https://npmjs.com) registry,
this allows you to install and setup plugins using a single command:

```sh
yarn install-plugin hbplugin-<plugin name>
```

This will download and install your plugin with `yarn`, and update your configuration
file to reflect the plugin's default config.

# Manual Install
Hindenburg also loads plugin folders in your plugin directory. This is helpful
to use as a development environment for plugins, although can also be used to
install unpublished plugins or to get the latest version of plugins.

This method also requires you to build the plugins yourself, if required.

You can either create a folder or `git clone` a repository into your plugin
directory.

```
plugins
|- hbplugin-my-plugin
   |- package.json
   |- yarn.lock
   |- index.ts
   |- dist
      |- index.js
|- package.json
|- yarn.lock
```