const child_process = require("child_process");
const fs = require("fs/promises");
const path = require("path");

function runCommandInDir(dir, command) {
    return new Promise((resolve, reject) => {
        child_process.exec(command, {
            cwd: dir
        }, (err) => {
            if (err) {
                reject(err);
                return;
            }
            resolve();
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
    const isTypescript = process.argv[2] === "ts";
    let pluginName = isTypescript
        ? process.argv[3]
        : process.argv[2];

    if (!pluginName.startsWith("hbplugin-")) {
        pluginName = "hbplugin-" + pluginName;
    }

    const pluginsDirectory = process.env.HINDENBURG_PLUGINS || path.resolve(process.cwd(), "./plugins");
    const pluginDirectory = path.resolve(pluginsDirectory, pluginName);

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

    console.log("Found plugins directory at: " + pluginsDirectory);

    try {
        await fs.stat(pluginDirectory);
        console.error("Directory for plugin name already exists: " + pluginName);
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
                "yarn tsc --init --outDir ./dist --experimentalDecorators"
            );

            packageJson.main = "./dist/index.js";
            packageJson.scripts = {
                build: "tsc -p ./"
            };
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
})();