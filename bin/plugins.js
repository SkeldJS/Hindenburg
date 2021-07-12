const chalk = require("chalk");
const child_process = require("child_process");
const fs = require("fs/promises");
const path = require("path");
const resolveFrom = require("resolve-from");
const { isHindenburgPlugin } = require("../src");
require("reflect-metadata");
require("./modulePatch");

function runCommandInDir(dir, command) {
    return new Promise((resolve, reject) => {
        child_process.exec(command, {
            cwd: dir
        }, (err, stdout) => {
            if (err) {
                reject(err);
                return;
            }
            resolve(stdout);
        });
    });
}

function createHelloWorldPlugin(pluginName, typescript) {
    return `import {
    HindenburgPlugin,
    Plugin,
    EventListener,
    PlayerJoinEvent,
    Room
} from "@skeldjs/hindenburg";

@HindenburgPlugin({
    id: "${pluginName}",
    version: "1.0.0",
    order: "none"
})
export default class extends Plugin {
    @EventListener("player.join")
    onPlayerJoin(ev${typescript ? ": PlayerJoinEvent<Room>" : ""}) {
        ev.room.sendChat("Hello, world!");
    }
}\n`.trim();
}

(async () => {
    const pluginsDirectory = process.env.HINDENBURG_PLUGINS || path.resolve(process.cwd(), "./plugins");
    const configFile = process.env.HINDENBURG_CONFIG || path.join(process.cwd(), "./config.json");

    try {
        const stat = await fs.stat(pluginsDirectory);
        
        if (!stat.isDirectory()) {
            console.error("Plugins directory found but was not a directory, please delete the file and run 'yarn setup'");
            return;
        }
    } catch (e) {
        console.error("Plugins directory not found or inaccessible, please run 'yarn setup'");
        return;
    }

    console.log("Found plugins directory: " + pluginsDirectory);

    const action = process.argv[2];
    if (action === "init") {
        const isTypescript = process.argv[3] === "ts";
        let pluginName = isTypescript
            ? process.argv[4]
            : process.argv[3];

        if (!pluginName) {
            console.error("Expected plugin name");
            return;
        }

        if (!pluginName.startsWith("hbplugin-")) {
            pluginName = "hbplugin-" + pluginName;
        }

        const pluginDirectory = path.resolve(pluginsDirectory, pluginName);

        try {
            await fs.stat(pluginDirectory);
            console.error("Plugin already exists: " + pluginName);
            return;
        } catch (e) {}

        console.log("Creating plugins/" + pluginName + "..");
        try {
            await fs.mkdir(pluginDirectory);
        } catch (e) {
            console.error("Failed to create directory for plugin: " + e.code);
            return;
        }

        console.log("Initialising yarn..");
        try {
            await runCommandInDir(pluginDirectory, "yarn init -y");
            await runCommandInDir(pluginDirectory, "yarn set version berry");
            await runCommandInDir(pluginDirectory, "yarn set version 3.0.0-rc.9");

            await fs.writeFile(path.resolve(pluginDirectory, "yarn.lock"), "", "utf8");
        } catch (e) {
            console.error("Failed to initialise yarn, deleting directory..");
            await runCommandInDir(
                pluginsDirectory,
                "yarn exec rm -r " + pluginDirectory
            );
            return;
        }

        console.log("Creating git repository..");
        try {
            await runCommandInDir(pluginDirectory, "git init");
        } catch (e) {
            console.warn("Failed to create git repository, moving on anyway..");
        }

        console.log("Installing dependencies..");
        try {
            await runCommandInDir(
                pluginDirectory,
                "yarn add --dev @skeldjs/hindenburg@link:../.."
                    + (isTypescript ? " typescript" : "")
            );
        } catch (e) {
            console.error("Failed to install dependencies, deleting directory..");
            await runCommandInDir(
                pluginsDirectory,
                "yarn exec rm -r " + pluginDirectory
            );
            return;
        }

        console.log("Configuring files..");
        try {
            const packageJsonFile = path.resolve(pluginDirectory, "package.json");
            const packageJson = require(packageJsonFile);

            if (isTypescript) {
                await runCommandInDir(
                    pluginDirectory,
                    "yarn tsc --init --outDir ./dist --experimentalDecorators --sourceMap --declaration --allowJs"
                );

                packageJson.main = "./dist/index.js";
                packageJson.scripts = {
                    build: "tsc -p ./"
                };
                const devDependencies = packageJson.devDependencies; // dumb thing to make it the last key in the package.json
                delete packageJson.devDependencies;
                packageJson.devDependencies = devDependencies;
            } else {
                await fs.writeFile(
                    path.resolve(pluginDirectory, "jsconfig.json"),
                    JSON.stringify({
                        compilerOptions: {
                            experimentalDecorators: true
                        }
                    }, undefined, 4),
                    "utf8"
                );
                packageJson.main = "./index.js";
            }

            await fs.writeFile(
                packageJsonFile,
                JSON.stringify(packageJson, undefined, 4),
                "utf8"
            );
        } catch (e) {
            console.error("Failed to configure files, deleting directory..");
            await runCommandInDir(
                pluginsDirectory,
                "yarn exec rm -r " + pluginDirectory
            );
            console.log(e);
            return;
        }

        console.log("Creating entrypoint file..");
        try {
            await fs.writeFile(
                path.resolve(pluginDirectory, isTypescript ? "index.ts" : "index.js"),
                createHelloWorldPlugin(pluginName, isTypescript),
                "utf8"
            );
        } catch (e) {
            console.error("Failed to create entrypoint, deleting directory..");
            await runCommandInDir(
                pluginsDirectory,
                "yarn exec rm -r " + pluginDirectory
            );
            return;
        }
        
        if (isTypescript) {
            console.log("Building plugin..");
            try {
                await runCommandInDir(pluginDirectory, "yarn build");
            } catch (e) {
                console.error("Failed to build plugin.");
                console.error(e);
            }
        }

        console.log("Initialised plugin!");
    } else if (action === "install") {
        let pluginName = process.argv[3];

        if (!pluginName) {
            console.error("Expected plugin name");
            return;
        }

        if (!pluginName.startsWith("hbplugin-")) {
            pluginName = "hbplugin-" + pluginName;
        }

        const pluginDirectory = path.resolve(pluginsDirectory, pluginName);
        try {
            await fs.stat(pluginDirectory);
            console.error("Plugin is a local folder, not installed with NPM.")
            console.log("To avoid conflicts in Hindenburg, you cannot have both a plugin installed from NPM and a local plugin with the same name");
            return;
        } catch (e) {}

        console.log("Getting plugin information..");
        let packageInfoJson;
        try {
            const packageInfoData = await runCommandInDir(pluginsDirectory, "yarn npm info " + pluginName + " --json");
            packageInfoJson = JSON.parse(packageInfoData);
        } catch (e) {
            try {
                const errorJson = JSON.parse(e);
                if (errorJson.data.includes("EAI_AGAIN")) {
                    console.error("Failed to get plugin package information, couldn't connect to the registry, check your internet connection");
                    return;
                }
                if (errorJson.name === 35) {
                    console.error("Plugin does not exist on the NPM registry, or it's private");
                    return;
                }
            } catch (e) {
                console.error("Failed to get plugin package information, either it doesn't exist, it's private, or couldn't connect to the internet");
                return;
            }
        }
        process.stdout.write("Installing " + chalk.green(packageInfoJson.name) + chalk.gray("@v" + packageInfoJson.version));
        if (packageInfoJson.maintainers[0]) {
            process.stdout.write(" by " + packageInfoJson.maintainers[0].name);
        }
        process.stdout.write("..\n");

        await runCommandInDir(pluginsDirectory, "yarn add " + packageInfoJson.name + "@" + packageInfoJson.version + " --json");

        console.log("Checking installed plugin..");
        const packageLocation = resolveFrom(pluginsDirectory, packageInfoJson.name);
        const { default: importedPlugin } = require(packageLocation);

        if (!importedPlugin || !isHindenburgPlugin(importedPlugin)) {
            console.error("Installed package was not a hindenburg plugin, uninstalling..");
            try {
                await runCommandInDir(pluginsDirectory, "yarn remove " + packageInfoJson.name);
            } catch (e) {
                console.error("Failed to uninstall package, run either 'yarn plugins uninstall\"" + packageInfoJson + "\"', or enter the directory yourself and use 'yarn remove \"" + packageInfoJson.name + "\"'");
            }
            return;
        }

        console.log("Adding plugin's default config to Hindenburg config..");
        const defaultConfig = importedPlugin.meta.defaultConfig;
        
        try {
            const configData = await fs.readFile(configFile, "utf8");
            const configJson = JSON.parse(configData);

            if (!configJson.plugins)
                configJson.plugins = {};

            configJson.plugins[importedPlugin.meta.id] = defaultConfig;

            await fs.writeFile(
                configFile,
                JSON.stringify(configJson, undefined, 4),
                "utf8"
            );
        } catch (e) {
            if (!e.code || e.code !== "ENOENT") {
                if (e.code) {
                    console.error("Could not open config file: " + e.code);
                } else {
                    console.error("Could not open config file:", e);
                }
            }
        }

        console.log("Installed plugin!");
    } else if (action === "uninstall") {
        let pluginName = process.argv[3];

        if (!pluginName) {
            console.error("Expected plugin name");
            return;
        }

        if (!pluginName.startsWith("hbplugin-")) {
            pluginName = "hbplugin-" + pluginName;
        }

        const pluginDirectory = path.resolve(pluginsDirectory, pluginName);

        let packageLocation;
        try {
            packageLocation = resolveFrom(pluginsDirectory, pluginName);
        } catch (e) {
            console.error("Plugin with name '" + pluginName + "' not installed or inaccessible");
            return;
        }

        console.log("Found plugin at: " + packageLocation);

        try {
            await fs.stat(pluginDirectory);
            console.error("Plugin is a local folder, not installed with NPM.")
            console.log("To avoid accidentally and permanently deleting important data, this must be uninstalled manually by deleting the folder and all references to it in your config.json");
            return;
        } catch (e) {}

        console.log("Uninstalling plugin..");
        try {
            await runCommandInDir(pluginsDirectory, "yarn remove " + pluginName);
        } catch (e) {
            console.log("Failed to uninstall plugin, try entering the plugin directory yourself and running 'yarn remove \"" + pluginName + "\"'");
            return;
        }

        // todo: maybe remove anti-cheat rule definitions too? or is that too extreme?
        console.log("Removing plugin from config.json..");
        try {
            const configData = await fs.readFile(configFile, "utf8");
            const configJson = JSON.parse(configData);

            if (configJson.plugins && typeof configJson.plugins[pluginName] !== "undefined") {
                delete configJson.plugins[pluginName];
            }

            await fs.writeFile(
                configFile,
                JSON.stringify(configJson, undefined, 4),
                "utf8"
            );
        } catch (e) {
            if (!e.code || e.code !== "ENOENT") {
                if (e.code) {
                    console.error("Could not open config file: " + e.code);
                } else {
                    console.error("Could not open config file:", e);
                }
            }
            console.log("Failed to remove plugin from config.json, this must be done manually");
        }

        console.log("Uninstalled plugin!");
    } else {
        console.log("Usage: yarn plugins <action>");
        console.log("       yarn plugins init [ts] <plugin name> " + chalk.gray("# initialise a new plugin"));
        console.log("       yarn plugins install   <plugin name> " + chalk.gray("# install a plugin from the npm registry"));
        console.log("       yarn plugins uninstall <plugin name> " + chalk.gray("# remove a plugin installed via npm"));
        console.error("Expected 'action' to be one of 'init', 'install', 'uninstall'.");
    }
})();