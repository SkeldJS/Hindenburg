const fs = require("fs/promises");
const path = require("path");
const child_process = require("child_process");

const defaultConfig = `{
    "$schema": "./misc/config.schema.json",
    "reactor": false,
    "versions": ["2021.4.2"],
    "anticheat": {
        "checkSettings": true,
        "maxConnectionsPerIp": 0,
        "checkObjectOwnership": true,
        "hostChecks": true,
        "malformedPackets": false,
        "invalidFlow": false,
        "invalidName": true,
        "massivePackets": {
            "penalty": "disconnect",
            "strikes": 3
        }
    },
    "cluster": {
        "name": "Capybara",
        "ip": "127.0.0.1",
        "ports": [
            22123
        ]
    },
    "loadbalancer": {
        "clusters": [
            {
                "name": "Capybara",
                "ip": "127.0.0.1",
                "ports": [
                    22123
                ]
            }
        ],
        "ip": "127.0.0.1",
        "port": 22023
    },
    "redis": {
        "host": "127.0.0.1",
        "port": 6379
    },
    "plugins": {}
}`;

async function createConfig() {
    const configFilename = process.env.HINDENBURG_CONFIG || path.resolve(process.cwd(), "config.json");

    try {
        await fs.stat(configFilename);

        console.log("config.json already exists, skipping..");
    } catch (e) {
        console.log("config.json not found, writing default config..");
        await fs.writeFile(configFilename, defaultConfig, "utf8")
        console.log("- wrote config.json!");
    }
}

async function createPlugins() {
    const pluginsDirectory = process.env.HINDENBURG_PLUGINS || path.resolve(process.cwd(), "./plugins");

    try {
        await fs.stat(pluginsDirectory);

        console.log("plugins directory already exists, skipping..");
    } catch (e) {
        console.log("plugins directory not found, creating directory..");
        await fs.mkdir(pluginsDirectory);
        console.log("creating package.json..");
        await fs.writeFile(path.resolve(pluginsDirectory, "package.json"), `{
    "dependencies": {

    }
}`, "utf8");
        console.log("creating yarn.lock..");
        await fs.writeFile(path.resolve(pluginsDirectory, "yarn.lock"), "", "utf8");
        await child_process.exec("yarn install");
        console.log("- wrote plugins directory, package.json and yarn.lock!");
    }
}

(async () => {
    await createConfig();
    await createPlugins();
})();