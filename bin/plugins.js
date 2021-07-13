require("reflect-metadata");
require("./modulePatch");

const chalk = require("chalk");
const fs = require("fs/promises");
const path = require("path");
const resolveFrom = require("resolve-from");
const { isHindenburgPlugin } = require("../src");
const { runCommandInDir, createSpinner, stopSpinner } = require("./util");

function createHelloWorldPlugin(pluginName, typescript) {
    return `import {
    HindenburgPlugin,
    Plugin,
    EventListener,
    PlayerSetNameEvent,
    Room
} from "@skeldjs/hindenburg";

@HindenburgPlugin({
    id: "${pluginName}",
    version: "1.0.0",
    order: "none"
})
export default class extends Plugin {
    @EventListener("player.setname")
    onPlayerSetName(ev${typescript ? ": PlayerSetNameEvent<Room>" : ""}) {
        ev.room.sendChat("Hello, world!");
    }
}\n`.trim();
}

function readChar() {
    return new Promise(resolve => {
        process.stdin.setRawMode(true);
        process.stdin.once("data", data => {
            resolve(data.toString("utf8").trim());
            process.stdin.setRawMode(false);
            process.stdin.pause();
        });
    });
}

async function getYesOrNo(question) {
    let output;
    while (output === undefined) {
        process.stdout.write(question + " (Y/N): ");
        const char = await readChar();

        if (char === "\x03") {
            process.stdout.write("\n");
            process.exit();
        }

        if (char === "y" || char === "Y") {
            output = true;
        } else if (char === "n" || char === "N") {
            output = false;
        } else {
            process.stdout.clearLine();
            process.stdout.cursorTo(0);
        }
    }
    process.stdout.write("\n");
    return output;
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
    if (action === "create") {
        const isTypescript = await getYesOrNo("Use typescript?");
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

        const yarnSpinner = createSpinner("Initialising yarn..");
        try {
            await runCommandInDir(pluginDirectory, "yarn init -y");

            await fs.writeFile(path.resolve(pluginDirectory, "yarn.lock"), "", "utf8");
        } catch (e) {
            stopSpinner(yarnSpinner, false);
            const deleteSpinner = createSpinner("Failed to initialise yarn, deleting directory..");
            await runCommandInDir(
                pluginsDirectory,
                "yarn exec rm -r " + pluginDirectory
            );
            stopSpinner(deleteSpinner, true);
            return;
        }
        stopSpinner(yarnSpinner, true);

        const updateYarnSpinner = createSpinner("Updating yarn..");
        try {
            await runCommandInDir(pluginDirectory, "yarn set version berry");
            await runCommandInDir(pluginDirectory, "yarn set version 3.0.0-rc.9");
            stopSpinner(updateYarnSpinner, true);
        } catch (e) {
            stopSpinner(updateYarnSpinner, false);
            console.log("Failed to update yarn, nevermind.");
        }

        const gitSpinner = createSpinner("Creating git repository..");
        try {
            await runCommandInDir(pluginDirectory, "git init");
            stopSpinner(gitSpinner, true);
        } catch (e) {
            console.warn("Failed to create git repository, moving on anyway..");
            stopSpinner(gitSpinner, false);
        }

        const dependenciesSpinner = createSpinner("Installing dependencies..");
        try {
            await runCommandInDir(
                pluginDirectory,
                "yarn add --dev @skeldjs/hindenburg@link:../.."
                    + (isTypescript ? " typescript" : "")
            );
        } catch (e) {
            stopSpinner(dependenciesSpinner, false);
            const deleteSpinner = createSpinner("Failed to install dependencies, deleting directory..");
            await runCommandInDir(
                pluginsDirectory,
                "yarn exec rm -r " + pluginDirectory
            );
            stopSpinner(deleteSpinner, true);
            return;
        }
        stopSpinner(dependenciesSpinner, true);

        const configureSpinner = createSpinner("Configuring files..");
        try {
            const packageJsonFile = path.resolve(pluginDirectory, "package.json");
            const packageJson = require(packageJsonFile);

            if (isTypescript) {
                await runCommandInDir(
                    pluginDirectory,
                    "yarn tsc --init --outDir ./dist --experimentalDecorators --sourceMap --declaration --allowJs --target es2017"
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
            stopSpinner(configureSpinner, false);
            const deleteSpinner = createSpinner("Failed to configure files, deleting directory..");
            await runCommandInDir(
                pluginsDirectory,
                "yarn exec rm -r " + pluginDirectory
            );
            stopSpinner(deleteSpinner);
            console.log(e);
            return;
        }
        stopSpinner(configureSpinner, true);

        const entryPointSpinner = createSpinner("Creating entrypoint file..");
        try {
            await fs.writeFile(
                path.resolve(pluginDirectory, isTypescript ? "index.ts" : "index.js"),
                createHelloWorldPlugin(pluginName, isTypescript),
                "utf8"
            );
        } catch (e) {
            stopSpinner(entryPointSpinner, false);
            const deleteSpinner = createSpinner("Failed to create entrypoint, deleting directory..");
            await runCommandInDir(
                pluginsDirectory,
                "yarn exec rm -r " + pluginDirectory
            );
            stopSpinner(deleteSpinner);
            return;
        }
        stopSpinner(entryPointSpinner, true);
        
        if (isTypescript) {
            const buildingSpinner = createSpinner("Building plugin..");
            try {
                await runCommandInDir(pluginDirectory, "yarn build");
                stopSpinner(buildingSpinner, true);
            } catch (e) {
                stopSpinner(buildingSpinner, false);
                console.error("Failed to build plugin.");
                console.error(e);
            }
        }

        console.log("Created plugin!");
    } else if (action === "install") {
        let pluginName = process.argv[3];

        if (!pluginName) {
            console.error("Expected plugin name");
            return;
        }

        if (!pluginName.startsWith("hbplugin-")) {
            pluginName = "hbplugin-" + pluginName;
        }

        console.log("Plugin name: " + chalk.green(pluginName));
        const pluginDirectory = path.resolve(pluginsDirectory, pluginName);
        try {
            await fs.stat(pluginDirectory);
            console.error("Plugin is a local folder, not installed with NPM.")
            console.log("To avoid conflicts in Hindenburg, you cannot have both a plugin installed from NPM and a local plugin with the same name");
            return;
        } catch (e) {}

        const pluginInfoSpinner = createSpinner("Getting plugin information..");
        let packageInfoJson;
        try {
            const packageInfoData = await runCommandInDir(pluginsDirectory, "yarn npm info " + pluginName + " --json");
            packageInfoJson = JSON.parse(packageInfoData);
        } catch (e) {
            stopSpinner(pluginInfoSpinner, false);
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
                throw e;
            } catch (e) {
                console.error("Failed to get plugin package information, either it doesn't exist, it's private, or couldn't connect to the internet");
                return;
            }
        }
        stopSpinner(pluginInfoSpinner, true);

        let installingText = "Installing " + chalk.green(packageInfoJson.name) + chalk.gray("@v" + packageInfoJson.version);
        if (packageInfoJson.maintainers[0]) {
            installingText += " by " + packageInfoJson.maintainers[0].name;
        }
        installingText += "..";

        const installingSpinner = createSpinner(installingText);
        try {
            await runCommandInDir(pluginsDirectory, "yarn add " + packageInfoJson.name + "@" + packageInfoJson.version + " --json");
        } catch (e) {
            stopSpinner(installingSpinner, false);
            console.error("Failed to install plugin package.");
            return;
        }
        stopSpinner(installingSpinner, true);

        const verifySpinner = createSpinner("Verifying installed plugin..");
        const packageLocation = resolveFrom(pluginsDirectory, packageInfoJson.name);
        const { default: importedPlugin } = require(packageLocation);

        if (!importedPlugin || !isHindenburgPlugin(importedPlugin)) {
            stopSpinner(verifySpinner, false);
            const uninstallSpinner = createSpinner("Installed package was not a hindenburg plugin, uninstalling..");
            try {
                await runCommandInDir(pluginsDirectory, "yarn remove " + packageInfoJson.name);
                stopSpinner(uninstallSpinner, true);
            } catch (e) {
                stopSpinner(uninstallSpinner, false);
                console.error("Failed to uninstall package, run either 'yarn plugins uninstall\"" + packageInfoJson + "\"', or enter the directory yourself and use 'yarn remove \"" + packageInfoJson.name + "\"'");
            }
            return;
        }
        stopSpinner(verifySpinner, true);

        const configSpinner = createSpinner("Creating config entry for plugin..");
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
            stopSpinner(configSpinner, false);
            if (!e.code || e.code !== "ENOENT") {
                if (e.code) {
                    console.error("Could not open config file: " + e.code);
                } else {
                    console.error("Could not open config file:", e);
                }
            }
        }
        stopSpinner(configSpinner, true);

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

        const resolvingPlugin = createSpinner("Resolving plugin..");
        try {
            resolveFrom(pluginsDirectory, pluginName);
        } catch (e) {
            stopSpinner(resolvingPlugin, false);
            console.error("Plugin with name '" + pluginName + "' not installed or inaccessible");
            return;
        }
        stopSpinner(resolvingPlugin, true);

        try {
            await fs.stat(pluginDirectory);
            console.error("Plugin is a local folder, not installed with NPM.")
            console.log("To avoid accidentally and permanently deleting important data, this must be uninstalled manually by deleting the folder and all references to it in your config.json");
            return;
        } catch (e) {}

        const uninstallingSpinner = createSpinner("Uninstalling plugin..");
        try {
            await runCommandInDir(pluginsDirectory, "yarn remove " + pluginName);
        } catch (e) {
            stopSpinner(uninstallingSpinner, false);
            console.log("Failed to uninstall plugin, try entering the plugin directory yourself and running 'yarn remove \"" + pluginName + "\"'");
            return;
        }
        stopSpinner(uninstallingSpinner, true);

        // todo: maybe remove anti-cheat rule definitions too? or is that too extreme?
        const removePluginSpinner = createSpinner("Removing plugin from config.json..");
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
            stopSpinner(removePluginSpinner, true);
        } catch (e) {
            stopSpinner(removePluginSpinner, false);
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
        console.error("Expected 'action' to be one of 'install', 'uninstall', 'list', or 'create'.");
    }
})();