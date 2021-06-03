# Commands
Below shows each core and utility command in Hindenburg, and their usages.

### `yarn build`
Build Hindenburg to production-ready Javascript.

**Usage**: `yarn build`

### `yarn watch`
Watch file changes in Hindenburg and automatically build accordingly.

**Usage**: `yarn watch`

### `yarn setup`
Setup Hindenburg for the first time, installs a default `config.json` and a
default `plugins`, if they do not already exist.

### `yarn add-plugin`
Install a plugin from npm.

**Usage:** `yarn add-plugin <pluginname>`

**Example:** `yarn add-plugin hbplugin-requirehostmods`

### `yarn add-server`
Add a single or several regions to our Among Us region list.

**Usage:** `yarn add-server reset`

**Usage:** `yarn add-server <region ip> <region port> <region name> [<region ip> <region port> <region name>...]`

**Example:** `yarn add-server 127.0.0.1 22023 Hindenburg 55.55.55.55 22023 MyServer`

### `yarn remove-server`
Remove a single or several regions from your among us region list.

**Usage:** `yarn remove-server <region name> [<region name>...]`

**Example:** `yarn remove-server Hindenburg`

### `yarn dev:cluster`
Start a Typescript development version of the Hindenburg cluster.

**Usage:** `yarn dev:cluster`

### `yarn start:cluster`
Start a Javascript production version of the Hindenburg cluster.

**Usage:** `yarn start:cluster`

### `yarn dev:load-balancer`
Start a Typescript development version of the Hindenburg loadbalancer.

**Usage:** `yarn dev:load-balancer`

### `yarn start:load-balancer`
Start a Typescript production version of the Hindenburg loadbalancer.

**Usage:** `yarn start:load-balancer`

## Environment Variables
A list of useful configuration environment variables that can be changed before
running any of the above commands.

|         Name         |                       Description                        |       Default       |
|----------------------|----------------------------------------------------------|---------------------|
| `HINDENBURG_CONFIG`  | Filename for where to find a config file for Hindenburg. | `%cwd%/config.json` |
| `HINDENBURG_PLUGINS` | Directory for where plugins for Hindenburg are stored.   | `%cwd%/plugins`    |