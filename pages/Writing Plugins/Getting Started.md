# Writing Plugins
Hindenburg allows you to start writing plugins relatively easily, in either
Typescript or Javascript, although it is very highly recommended that you use
Typescript, as otherwise you likely will not get sufficient typing.

You can either set up a new plugin using [the automated script](#setting-up),
or [manually](#setting-up-manually).

## Setting Up
Hindenburg comes with a small utility script to automatically create a new plugin
in a development environment:
```sh
yarn plugins create <plugin name>
```

## Setting Up Manually
This is a short guide to setting up for writing a plugin manually if you want
more control, or are runnning into issues with the automatic method.

### Pre-requisites
* Somewhat of a programming experience, although not entirely necessary.
* [Yarn](https://yarnpkg.com), it's highly advised you use yarn as your package
manager for your plugins.
* [Git](https://git-scm.org), optionally.

### Creating a Folder
You can simply create a folder in your plugin directory, make sure it begins with
`hbplugin-`.

Open a command prompt in this folder to continue.

### Initialising the Folder.
Initialise a `package.json` and a `README` in your directory:
```sh
yarn init -y
```

Optionally, use yarn v3.0.0:
```sh
# Yarn requires you to install v2 first to install a specific v3 version.
yarn set version berry
yarn set version version 3.0.0-rc.9
```

For reasons related to yarn and workspaces being kept separate from Hindenburg
itself, you also need to create an empty `yarn.lock` file in the repository:
```sh
touch yarn.lock
## OR
echo "" > yarn.lock
```

Optionally, create a new git repository to track updates:
```sh
git init
```

### Install dependencies
Link your base hindenburg installation to your plugin, you can use yarn's `link:`
protocol, and can be installed as a dev dependency since it is only required for
types, as Hindenburg forces all plugins to use the same version of it:
```sh
yarn add --dev @skeldjs/hindenburg@link:../..
```

#### If you are using Typescript
Install typescript as a dev dependency:
```sh
yarn add --dev typescript
```

### Configure files
#### If you are using Typescript
Run the following rather long command to create a `tsconfig.json`:
```sh
yarn tsc --init --outDir ./dist --experimentalDecorators --sourceMap --declaration --allowJs --target es2017
```
Add the following to your `package.json`:
```json
{
    "main": "./dist/index.js",
    "scripts": {
        "build": "tsc -p ./"
    }
}
```

#### If you are _not_ using Typescript
Create a file named `jsconfig.json` with the following contents:
```json
{
    "compilerOptions": {
        "experimentalDecorators": true
    }
}
```

### Create an entrypoint
If you want to use typescript, you can create an
`index.ts` file in your plugin's folder. If you want to use plain javascript, you can create a `index.js` file instead.