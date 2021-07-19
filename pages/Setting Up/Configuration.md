# JSON Configuration
Hindenburg allows you to configure the server via a `config.json` file in the current
working directory, or from the `HINDENBURG_CONFIG` environment variable.

You can see documentation for the all configuration options [here](https://skeldjs.github.io/Hindenburg/interfaces/hindenburgconfig.html).

If you're using a modern text editor such as Visual Studio Code, you'll likely
get code hints for the config as defined in the [JSON schema](https://github.com/SkeldJS/Hindenburg/blob/master/misc/config.schema.json).

### Plugin Configuration
You can pass configuration to individual plugins via the `plugins` object.

**Example**
```ts
{
    "plugins": {
        "hbplugin-ban-textfile": {
            "file": "./bans.json"
        }
    }
}
```

Or you can disable plugins from being loaded by setting them to `false`:
**Example**
```ts
{
    "plugins": {
        "hbplugin-ban-texfile": false
    }
}
```

To stop Hindenburg from loading all plugins defined in your plugins directory,
set the `loadDirectory` option to `false`:
```ts
{
    "plugins": {
        "loadDirectory": false,
        "hbplugin-ban-textfile": true // load hbplugin-ban-textfile with a default config
    }
}
```
Note that Hindenburg will still load all of your plugins installed via NPM.

### Anti-Cheat configuration
Coming soon probably
```json
{
    "anticheat": {
        "rules": {
            "hostChecks": {
                "enabled": false,
                "rules": {
                    "setname": true
                }
            }
        }
    }
}
```