import "./modulePatch";

import path from "path";
import fs from "fs/promises";

import chalk from "chalk";
import prompts from "prompts";
import resolveFrom from "resolve-from";

import pluginGitignore from "./resources/plugin-gitignore";

import { Logger } from "../src/logger";
import { runCommandInDir } from "./util/runCommandInDir";
import { Spinner } from "./util/Spinner";
import { PluginLoader, Plugin } from "../src/handlers";
import createSchema from "./createSchema";

const pluginsDirectories: string[] = process.env.HINDENBURG_PLUGINS?.split(",").map(x => x.trim()) || [ path.resolve(process.cwd(), "./plugins") ];
const configFile: string = process.env.HINDENBURG_CONFIG || path.join(process.cwd(), "./config.json");

async function buildHindenburg(logger: Logger) {
    const buildSpinner = new Spinner("Building Hindenburg.. %s").start();
    try {
        await runCommandInDir(process.cwd(), "yarn build");
        buildSpinner.success();
        return true;
    } catch (e) {
        buildSpinner.fail();
        logger.error("Failed to build Hindenburg, you will have to build both Hindenburg and your plugin later");
        return false;
    }
}

function getCodeFriendlyPluginName(pluginName: string) {
    return pluginName
        .substring(9)
        .replace(/(-|^)./g, x => (x[0] === "-" ? x[1] : x[0]).toUpperCase()) + "Plugin";
}

function createHelloWorldPlugin(pluginName: string, isTypescript: boolean, pluginType: "room"|"worker") {
    const codeFriendlyName = getCodeFriendlyPluginName(pluginName);

    return `${isTypescript ? "import" : "const" } {
    HindenburgPlugin,
    ${pluginType === "worker" ? "WorkerPlugin" : "RoomPlugin"},
    EventListener${isTypescript ? ",\n    PlayerSetNameEvent,\n    Room" + (pluginType === "worker" ? ",\n    Worker" : "") : ""}
} ${isTypescript ? "from " : "= require("}"@skeldjs/hindenburg"${isTypescript ? "" : ")"};

export class ${codeFriendlyName} extends ${pluginType === "worker" ? "WorkerPlugin" : "RoomPlugin"} {
    ${isTypescript ? "message: string\n\n    " : ""}constructor(${pluginType}${isTypescript ? ": " + (pluginType === "worker" ? "Worker" : "Room") : ""}, config${isTypescript ? ": any" : ""}) {
        super(${pluginType}, config);

        this.message = config.message;
    }

    onConfigUpdate(oldConfig${isTypescript ? ": any" : ""}, newConfig${isTypescript ? ": any" : ""}) {
        this.message = newConfig.message;
        this.logger.info("Updated message to '%s'!", this.message);
    }

    @EventListener("player.setname")
    onPlayerSetName(ev${isTypescript ? ": PlayerSetNameEvent<Room>" : ""}) {
        ev.room.sendChat(this.message);
    }
}\n`.trim();
}

async function getPackageInfo(pluginsDirectory: string, packageName: string, logger: Logger) {
    const pluginInfoSpinner = new Spinner("Fetching plugin information.. %s").start();
    try {
        const packageInfoData = await runCommandInDir(pluginsDirectory, "yarn npm info " + packageName + " --json");
        pluginInfoSpinner.success();
        return JSON.parse(packageInfoData);
    } catch (e) {
        pluginInfoSpinner.fail();
        try {
            const errorJson = JSON.parse((e as string));
            if (errorJson.data.includes("EAI_AGAIN")) {
                logger.error("Failed to get plugin package information, couldn't connect to the registry, check your internet connection");
                return;
            }
            if (errorJson.name === 35) {
                logger.error("Plugin does not exist on the NPM registry, or it's private");
                return;
            }
            throw e;
        } catch (e) {
            logger.error("Failed to get plugin package information, either it doesn't exist, it's private, or you aren't connected to the internet");
            return;
        }
    }
}

async function getHindenburgVersion(): Promise<string> {
    const packageJsonText = await fs.readFile(path.resolve(__dirname, "../package.json"), "utf8");
    const packageJson = JSON.parse(packageJsonText);

    return packageJson.version;
}

async function choosePluginsDirectory() {
    if (pluginsDirectories.length === 1) {
        return pluginsDirectories[0];
    }

    const { pluginsDirectory } = await prompts({
        type: "select",
        name: "pluginsDirectory",
        message: "Choose plugin directory",
        choices: pluginsDirectories.map(directory => {
            return {
                title: chalk.grey(directory),
                value: directory
            };
        })
    });

    return pluginsDirectory;
}

async function runCreatePlugin() {
    const logger = new Logger;

    const argvPluginName = process.argv[3];

    if (!argvPluginName) {
        logger.error("Expected plugin name as an argument, usage: `yarn plugins create <plugiun name>`.");
        return;
    }

    const pluginName = argvPluginName.startsWith("hbplugin-")
        ? argvPluginName
        : "hbplugin-" + argvPluginName;

    if (!/^[a-z-]+$/.test(pluginName)) {
        logger.error("Plugin name must contain only lowercase a-z and hyphens (-)");
        return;
    }

    const pluginsDirectory = await choosePluginsDirectory();

    try {
        const stat = await fs.stat(pluginsDirectory);

        if (!stat.isDirectory()) {
            logger.error("Plugins directory found but was not a directory, please delete the file and run 'yarn setup'");
            return;
        }
    } catch (e) {
        logger.error("Plugins directory not found or inaccessible, please run 'yarn setup'");
        return;
    }

    const codeFriendlyName = getCodeFriendlyPluginName(pluginName);

    const pluginDirectory = path.resolve(pluginsDirectory, pluginName);

    try {
        await fs.stat(pluginDirectory);
        logger.error("Plugin already exists: " + pluginName);
        return;
    } catch (e) { void e; }

    const { useTypescript } = await prompts({
        type: "confirm",
        name: "useTypescript",
        message: "Use typescript (recommended)?",
        initial: true
    });

    const { packageManager } = await prompts({
        type: "select",
        name: "packageManager",
        message: "Package manager",
        choices: [
            {
                title: "Yarn (recommended)",
                value: "yarn"
            },
            {
                title: "NPM",
                value: "npm"
            },
            {
                title: "PNPM",
                value: "pnpm"
            }
        ],
        initial: 0
    }) as { packageManager: "yarn"|"npm"|"pnpm" };


    const { createGit } = await prompts({
        type: "confirm",
        name: "createGit",
        message: "Create Git repository?",
        initial: true
    });

    const { pluginType } = await prompts({
        type: "select",
        name: "pluginType",
        message: "Plugin type",
        choices: [
            {
                title: "Room",
                value: "room"
            },
            {
                title: "Worker",
                value: "worker"
            }
        ],
        initial: 1
    }) as { pluginType: "room"|"worker" };

    const fetchingAuthorDetails = new Spinner("Fetching author details.. %s").start();
    let author: { name: string; email: string }|undefined = undefined;
    try {
        const gitConfigUsername = await runCommandInDir(process.cwd(), "git config user.name");
        const gitConfigEmail = await runCommandInDir(process.cwd(), "git config user.email");

        fetchingAuthorDetails.success();

        const { setAuthor } = await prompts({
            type: "confirm",
            name: "setAuthor",
            message: `Set author to ${gitConfigUsername.trim()} <${gitConfigEmail.trim()}>?`,
            initial: true
        });

        if (setAuthor) {
            author = {
                name: gitConfigUsername.trim(),
                email: gitConfigEmail.trim()
            };
        }
    } catch (e) {
        fetchingAuthorDetails.fail();
        logger.warn("Couldn't get any details, nevermind.");
    }

    const buildSucceeded = !useTypescript || await buildHindenburg(logger);

    const creatingDirectorySpinner = new Spinner("Creating plugins/" + pluginName + ".. %s").start();
    try {
        await fs.mkdir(pluginDirectory);
    } catch (e) {
        creatingDirectorySpinner.fail();
        logger.error("Failed to create directory for plugin: " + (e as { code: string }).code);
        return;
    }
    creatingDirectorySpinner.success();

    if (packageManager === "yarn") {
        const yarnSpinner = new Spinner("Initialising yarn.. %s").start();
        try {
            await runCommandInDir(pluginDirectory, "yarn init -y");
            await fs.writeFile(path.resolve(pluginDirectory, "yarn.lock"), "", "utf8");
            yarnSpinner.success();
        } catch (e) {
            yarnSpinner.fail();
            logger.error("Failed to initialise yarn");
            const deleteSpinner = new Spinner("Deleting directory.. %s").start();
            try {
                await runCommandInDir(
                    pluginsDirectory,
                    "yarn exec rm -r " + pluginDirectory
                );
                deleteSpinner.success();
            } catch (e) {
                deleteSpinner.fail();
            }
            console.log(e);
            return;
        }

        const updateYarnSpinner = new Spinner("Updating yarn.. %s").start();
        try {
            await runCommandInDir(pluginDirectory, "yarn set version berry");
            await runCommandInDir(pluginDirectory, "yarn set version 3.0.2");
            updateYarnSpinner.success();
        } catch (e) {
            updateYarnSpinner.fail();
            logger.warn("Failed to update yarn, nevermind");
        }
    } else if (packageManager === "npm") {
        const yarnSpinner = new Spinner("Initialising npm.. %s").start();
        try {
            await runCommandInDir(pluginDirectory, "npm init -y");
            yarnSpinner.success();
        } catch (e) {
            yarnSpinner.fail();
            logger.error("Failed to initialise npm");
            const deleteSpinner = new Spinner("Deleting directory.. %s").start();
            try {
                await runCommandInDir(
                    pluginsDirectory,
                    "yarn exec rm -r " + pluginDirectory
                );
                deleteSpinner.success();
            } catch (e) {
                deleteSpinner.fail();
            }
            console.log(e);
            return;
        }
    } else if (packageManager === "pnpm") {
        const yarnSpinner = new Spinner("Initialising pnpm.. %s").start();
        try {
            await runCommandInDir(pluginDirectory, "pnpm init -y");
            yarnSpinner.success();
        } catch (e) {
            yarnSpinner.fail();
            logger.error("Failed to initialise pnpm");
            const deleteSpinner = new Spinner("Deleting directory.. %s").start();
            try {
                await runCommandInDir(
                    pluginsDirectory,
                    "yarn exec rm -r " + pluginDirectory
                );
                deleteSpinner.success();
            } catch (e) {
                deleteSpinner.fail();
            }
            console.log(e);
            return;
        }
    }

    if (createGit) {
        const gitSpinner = new Spinner("Creating git repository.. %s").start();
        try {
            await runCommandInDir(pluginDirectory, "git init");
            gitSpinner.success();

            try {
                await fs.writeFile(path.resolve(pluginDirectory, ".gitignore"), pluginGitignore, "utf8");
            } catch (e) {
                logger.warn("Couldn't create .gitignore: %s", (e as any).code || e);
            }
        } catch (e) {
            gitSpinner.fail();
            logger.warn("Failed to create git repository, moving on anyway");
        }
    }

    const dependenciesSpinner = new Spinner("Installing dependencies.. %s").start();
    try {
        if (packageManager === "yarn") {
            await runCommandInDir(
                pluginDirectory,
                "yarn add --dev @skeldjs/hindenburg@link:../.."
                    + (useTypescript ? " typescript@latest" : "")
            );
        } else if (packageManager === "npm") {
            await runCommandInDir(
                pluginDirectory,
                "npm install --save-dev @skeldjs/hindenburg@file:../.."
                    + (useTypescript ? " typescript@latest" : "")
            );
        } else if (packageManager === "pnpm") {
            await runCommandInDir(
                pluginDirectory,
                "pnpm install --save-dev @skeldjs/hindenburg@file:../.."
                    + (useTypescript ? " typescript@latest" : "")
            );
        }

        dependenciesSpinner.success();
    } catch (e) {
        dependenciesSpinner.fail();
        logger.error("Failed to install dependencies");
        const deleteSpinner = new Spinner("Deleting directory.. %s").start();
        try {
            await runCommandInDir(
                pluginsDirectory,
                "yarn exec rm -r " + pluginDirectory
            );
            deleteSpinner.success();
        } catch (e) {
            deleteSpinner.fail();
        }
        console.log(e);
        return;
    }

    const configureSpinner = new Spinner("Configuring files.. %s").start();
    try {
        const packageJsonFile = path.resolve(pluginDirectory, "package.json");
        const packageJson = JSON.parse(await fs.readFile(packageJsonFile, "utf8"));

        if (useTypescript) {
            const prefix = packageManager === "yarn"
                ? "yarn"
                : packageManager === "npm"
                    ? "npx"
                    : packageManager === "pnpm"
                        ? "pnpm exec"
                        : "yarn";

            await runCommandInDir(
                pluginDirectory,
                prefix + " tsc --init --outDir ./dist --experimentalDecorators --emitDecoratorMetadata --sourceMap --declaration --allowJs --target es2017"
            );
        } else {
            await fs.writeFile(
                path.resolve(pluginDirectory, "jsconfig.json"),
                JSON.stringify({
                    compilerOptions: {
                        experimentalDecorators: true,
                        emitDecoratorMetadata: true
                    }
                }, undefined, 2),
                "utf8"
            );
        }

        packageJson.version = "1.0.0";
        packageJson.description = "My cool Hindenburg plugin";
        packageJson.keywords = [ "hindenburg", "plugin", "among us" ];
        packageJson.license = "GPL-3.0-only";
        packageJson.author = author;
        packageJson.files = [ "dist" ];
        packageJson.main = useTypescript ? "./dist/index.js" : "./index.js";
        if (useTypescript) {
            packageJson.types = "./index.ts";
            packageJson.publishConfig = {
                types: "./dist/index.d.ts"
            }
        }
        packageJson.scripts = {
            publish: "yarn npm publish --access public"
        };
        if (useTypescript) {
            packageJson.scripts.build = "tsc --project ./";
            packageJson.scripts.watch = "tsc --watch --project ./";
            if (packageManager === "yarn") {
                packageJson.scripts.prepack = "yarn build";
            } else if (packageManager === "npm") {
                packageJson.scripts.prepack = "npm run build";
            } else if (packageManager === "pnpm") {
                packageJson.scripts.prepack = "pnpm run build";
            }
        }
        const hindenburgVersion = await getHindenburgVersion();
        packageJson.engines = {
            node: ">=14",
            hindenburg: hindenburgVersion.split(".").slice(0, -1).join(".") + ".*"
        };

        const devDependencies = packageJson.devDependencies; // dumb thing to make it the last key in the package.json
        delete packageJson.devDependencies;
        packageJson.devDependencies = devDependencies;

        packageJson.plugin = {
            loadOrder: "none",
            message: "Hello, world!"
        };

        await fs.writeFile(
            packageJsonFile,
            JSON.stringify(packageJson, undefined, 2),
            "utf8"
        );

        configureSpinner.success();
    } catch (e) {
        configureSpinner.fail();
        logger.error("Failed to configure files");
        const deleteSpinner = new Spinner("Deleting directory.. %s").start();
        try {
            await runCommandInDir(
                pluginsDirectory,
                "yarn exec rm -r " + pluginDirectory
            );
            deleteSpinner.success();
        } catch (e) {
            deleteSpinner.fail();
        }
        console.log(e);
        return;
    }

    const schemaSpinner = new Spinner("Creating config schema.. %s").start();
    try {
        await fs.writeFile(path.resolve(pluginDirectory, "config.schema.json"), "{}", "utf8");
        schemaSpinner.success();
    } catch (e) {
        schemaSpinner.fail();
        logger.warn("Failed to create config schema, moving on anyway");
    }

    const entryPointSpinner = new Spinner("Creating entrypoint files.. %s").start();
    try {
        await fs.mkdir(path.resolve(pluginDirectory, "src"));
        await fs.writeFile(
            path.resolve(pluginDirectory, useTypescript ? "index.ts" : "index.js"),
            `import { ${codeFriendlyName} } from "./src/plugin";

export * from "./src";
export default ${codeFriendlyName};`,
            "utf8"
        );
        await fs.writeFile(
            path.resolve(pluginDirectory, "src", useTypescript ? "index.ts" : "index.js"),
            "export * from \"./plugin\";",
            "utf8"
        );
        await fs.writeFile(
            path.resolve(pluginDirectory, "src", useTypescript ? "plugin.ts" : "plugin.js"),
            createHelloWorldPlugin(pluginName, useTypescript, pluginType),
            "utf8"
        );
        entryPointSpinner.success();
    } catch (e) {
        entryPointSpinner.fail();
        logger.error("Failed to create entrypoint");
        const deleteSpinner = new Spinner("Deleting directory.. %s").start();
        try {
            await runCommandInDir(
                pluginsDirectory,
                "yarn exec rm -r " + pluginDirectory
            );
            deleteSpinner.success();
        } catch (e) {
            deleteSpinner.fail();
        }
        console.log(e);
        return;
    }

    if (useTypescript && buildSucceeded) {
        const buildingSpinner = new Spinner("Building plugin.. %s").start();
        try {
            if (packageManager === "yarn") {
                await runCommandInDir(pluginDirectory, "yarn build");
            } else if (packageManager === "npm") {
                await runCommandInDir(pluginDirectory, "npm run build");
            } else if (packageManager === "pnpm") {
                await runCommandInDir(pluginDirectory, "pnpm run build");
            }
            buildingSpinner.success();
        } catch (e) {
            buildingSpinner.fail();
            logger.error("Failed to build plugin.");
            logger.error("Error: %s", e);
        }
    }

    logger.info("Successfully created plugin!");
}

async function verifyInstalledPlugin(logger: Logger, pluginsDirectory: string, packageInfoJson: any, packageFilename: string) {
    const verifySpinner = new Spinner("Verifying installed plugin.. %s").start();
    try {
        const packageLocation = resolveFrom(pluginsDirectory, packageFilename);
        const { default: importedPlugin } = await import(packageLocation) as { default: Plugin };

        if (!importedPlugin || !PluginLoader.isHindenburgPlugin(importedPlugin)) {
            verifySpinner.fail();
            logger.error("Installed package was not a hindenburg plugin");
            return false;
        }

        verifySpinner.success();

        const configSpinner = new Spinner("Creating config entry for plugin.. %s").start();
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

            configSpinner.success();
        } catch (e) {
            configSpinner.fail();
            const err = e as { code: string };
            if (!err.code || err.code !== "ENOENT") {
                if (err.code) {
                    logger.error("Could not open config file: %s", err.code);
                } else {
                    logger.error("Could not open config file: %s", err);
                }
            }
        }

        logger.info("Installed plugin: %s", chalk.green(importedPlugin.meta.id) + chalk.gray("@v" + importedPlugin.meta.version));
    } catch (e) {
        if (verifySpinner.isSpinning()) {
            verifySpinner.fail();
            logger.error("Failed to verify plugin: %s", (e as any).message || e);
            return false;
        }
        throw e;
    }

    return true;
}

async function runInstallPlugin() {
    const logger = new Logger;

    const argvPluginName = process.argv[3];

    if (!argvPluginName) {
        logger.error("Expected plugin name as an argument, usage: `yarn plugins install <plugiun name>`.");
        return;
    }

    const pluginsDirectory = await choosePluginsDirectory();

    try {
        const stat = await fs.stat(pluginsDirectory);

        if (!stat.isDirectory()) {
            logger.error("Plugins directory found but was not a directory, please delete the file and run 'yarn setup'");
            return;
        }
    } catch (e) {
        logger.error("Plugins directory not found or inaccessible, please run 'yarn setup'");
        return;
    }

    const pluginName = argvPluginName.startsWith("hbplugin-")
        ? argvPluginName
        : "hbplugin-" + argvPluginName;

    const pluginDirectory = path.resolve(pluginsDirectory, pluginName);

    try {
        await fs.stat(pluginDirectory);
        logger.error("Plugin already exists as a local folder, not installed vpa NPM");
        return;
    } catch (e) { void e; }

    const packageInfoJson = await getPackageInfo(pluginsDirectory, pluginName, logger);

    if (!packageInfoJson)
        return;

    let installingText = "Installing " + chalk.green(packageInfoJson.name) + chalk.gray("@v" + packageInfoJson.version);
    if (packageInfoJson.maintainers[0]) {
        installingText += " by " + packageInfoJson.maintainers[0].name;
    }
    installingText += ".. %s";

    const installingSpinner = new Spinner(installingText).start();
    try {
        await runCommandInDir(pluginsDirectory, "yarn add " + packageInfoJson.name + "@" + packageInfoJson.version + " --json");
        installingSpinner.success();
    } catch (e) {
        installingSpinner.fail();
        logger.error("Failed to install plugin package.");
        return;
    }

    if (!await verifyInstalledPlugin(logger, pluginsDirectory, packageInfoJson, packageInfoJson.name)) {
        const uninstallSpinner = new Spinner("Uninstalling invalid plugin.. %s");
        try {
            await runCommandInDir(pluginsDirectory, "yarn remove " + packageInfoJson.name);
            uninstallSpinner.success();
        } catch (e) {
            uninstallSpinner.fail();
            console.error("Failed to uninstall package, run either 'yarn plugins uninstall \"" + packageInfoJson + "\"', or enter the directory manually and run 'yarn remove \"" + packageInfoJson.name + "\"'");
        }
    }
}

async function runImportPlugin() {
    const logger = new Logger;

    const argvPluginRepo = process.argv[3];

    if (!argvPluginRepo) {
        logger.error("Expected plugin repo URL as an argument, usage: `yarn plugins import <plugiun repo>`.");
        return;
    }

    const pluginsDirectory = await choosePluginsDirectory();

    try {
        const stat = await fs.stat(pluginsDirectory);

        if (!stat.isDirectory()) {
            logger.error("Plugins directory found but was not a directory, please delete the file and run 'yarn setup'");
            return;
        }
    } catch (e) {
        logger.error("Plugins directory not found or inaccessible, please run 'yarn setup'");
        return;
    }

    let pluginDirectoryName = path.basename(argvPluginRepo).split(".")[0];

    const cloningPlugin = new Spinner("Cloning plugin.. %s").start();
    try {
        const stdout = await runCommandInDir(pluginsDirectory, "git clone \"" + argvPluginRepo + "\"");
        const matchClonedDirectory = stdout.match(/Cloning into '(.+)'.../);
        if (matchClonedDirectory) {
            pluginDirectoryName = matchClonedDirectory[1];
        }
        cloningPlugin.success();
    } catch (e) {
        cloningPlugin.fail();
        if ((e as any).toString().includes("already exists and is not an empty directory")) {
            logger.error("Plugin repo '%s' already installed", argvPluginRepo);
            return;
        }
        logger.error("Plugin repo '%s' does not exist or is inaccessible", argvPluginRepo);
        return;
    }

    const pluginDirectory = path.resolve(pluginsDirectory, pluginDirectoryName);

    const findingPackageManager = new Spinner("Finding package manager.. %s").start();
    let packageManager: "yarn"|"npm"|"pnpm";
    try {
        await fs.stat(path.resolve(pluginDirectory, "yarn.lock"));
        packageManager = "yarn";
        findingPackageManager.success();
    } catch (e) {
        try {
            await fs.stat(path.resolve(pluginDirectory, "package-lock.json"));
            packageManager = "npm";
            findingPackageManager.success();
        } catch (e) {
            try {
                await fs.stat(path.resolve(pluginDirectory, "pnpm-lock.yaml"));
                packageManager = "pnpm";
                findingPackageManager.success();
            } catch (e) {
                findingPackageManager.fail();
                packageManager = "yarn";
                logger.error("Failed to find package manager, using yarn by default..");
            }
        }
    }

    logger.info("Using package manager: '%s'", packageManager);

    const installingDependencies = new Spinner("Installing dependencies.. %s").start();
    try {
        if (packageManager === "yarn") {
            await runCommandInDir(pluginDirectory, "yarn");
        } else if (packageManager === "npm") {
            await runCommandInDir(pluginDirectory, "npm install");
        } else if (packageManager === "pnpm") {
            await runCommandInDir(pluginDirectory, "pnpm install");
        }
        installingDependencies.success();
    } catch (e) {
        installingDependencies.fail();
        logger.error("Failed to install dependencies");
        const deleteSpinner = new Spinner("Deleting directory.. %s").start();
        try {
            await runCommandInDir(
                pluginsDirectory,
                "yarn exec rm -r " + pluginDirectory
            );
            deleteSpinner.success();
        } catch (e) {
            deleteSpinner.fail();
        }
        if (packageManager === "yarn") {
            logger.info("You might not have yarn installed, check out https://yarnpkg.com/getting-started/install for installation instructions");
        } else if (packageManager === "pnpm") {
            logger.info("You might not have pnpm installed, check out https://pnpm.io/installation for installation instructions");
        } else {
            console.log(e);
        }
        return;
    }

    let packageJson;
    const fetchingScripts = new Spinner("Fetching scripts.. %s").start();
    try {
        const packageJsonFile = path.resolve(pluginDirectory, "package.json");
        packageJson = JSON.parse(await fs.readFile(packageJsonFile, "utf8"));
        fetchingScripts.success();
        if (packageJson.scripts) {
            if (packageJson.scripts.build) {
                const buildingPlugin = new Spinner("Building plugin.. %s").start();
                try {
                    if (packageManager === "yarn") {
                        await runCommandInDir(pluginDirectory, "yarn build");
                    } else if (packageManager === "npm") {
                        await runCommandInDir(pluginDirectory, "npm run build");
                    } else if (packageManager === "pnpm") {
                        await runCommandInDir(pluginDirectory, "pnpm run build");
                    }
                    buildingPlugin.success();
                } catch (e) {
                    buildingPlugin.fail();
                    if (packageManager === "yarn") {
                        logger.error("Failed to build plugin, this must be done manually by running 'yarn build' in the installed plugin directory");
                    } else if (packageManager === "npm") {
                        logger.error("Failed to build plugin, this must be done manually by running 'npm run build' in the installed plugin directory");
                    } else if (packageManager === "pnpm") {
                        logger.error("Failed to build plugin, this must be done manually by running 'pnpm run build' in the installed plugin directory");
                    }
                }
            }
        }
    } catch (e) {
        fetchingScripts.fail();
        logger.error("Failed to fetch scripts");
        const deleteSpinner = new Spinner("Deleting directory.. %s").start();
        try {
            await runCommandInDir(
                pluginsDirectory,
                "yarn exec rm -r " + pluginDirectory
            );
            deleteSpinner.success();
        } catch (e) {
            deleteSpinner.fail();
        }
        console.log(e);
        return;
    }

    if (!await verifyInstalledPlugin(logger, pluginsDirectory, packageJson, "./" + pluginDirectoryName)) {
        const deleteSpinner = new Spinner("Deleting directory.. %s").start();
        try {
            await runCommandInDir(
                pluginsDirectory,
                "yarn exec rm -r " + pluginDirectory
            );
            deleteSpinner.success();
        } catch (e) {
            deleteSpinner.fail();
        }
    }
}

async function runUninstallPlugin() {
    const logger = new Logger;

    const argvPluginName = process.argv[3];

    if (!argvPluginName) {
        logger.error("Expected plugin name as an argument, usage: `yarn plugins uninstall <plugiun name>`.");
        return;
    }

    const pluginsDirectory = await choosePluginsDirectory();

    try {
        const stat = await fs.stat(pluginsDirectory);

        if (!stat.isDirectory()) {
            logger.error("Plugins directory found but was not a directory, please delete the file and run 'yarn setup'");
            return;
        }
    } catch (e) {
        logger.error("Plugins directory not found or inaccessible, please run 'yarn setup'");
        return;
    }

    const pluginName = argvPluginName.startsWith("hbplugin-")
        ? argvPluginName
        : "hbplugin-" + argvPluginName;

    const pluginDirectory = path.resolve(pluginsDirectory, pluginName);

    const resolvingPlugin = new Spinner("Resolving plugin.. %s").start();
    try {
        resolveFrom(pluginsDirectory, pluginName);
    } catch (e) {
        resolvingPlugin.fail();
        logger.error("Plugin with name '%s' not installed or inaccessible", pluginName);
        return;
    }

    try {
        await fs.stat(pluginDirectory);
        resolvingPlugin.fail();
        logger.error("Plugin is a local folder, not installed with NPM, please delete the folder manually.");
        return;
    } catch (e) { void e; }

    resolvingPlugin.success();

    const uninstallingSpinner = new Spinner("Uninstalling plugin.. %s").start();
    try {
        await runCommandInDir(pluginsDirectory, "yarn remove " + pluginName);
        uninstallingSpinner.success();
    } catch (e) {
        uninstallingSpinner.fail();
        console.log("Failed to uninstall plugin, try entering the plugin directory yourself and running 'yarn remove \"" + pluginName + "\"'");
        return;
    }

    const removePluginSpinner = new Spinner("Removing plugin from config.json.. %s").start();
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
        removePluginSpinner.success();
    } catch (e) {
        removePluginSpinner.fail();
        const err = e as { code: string };
        if (!err.code || err.code !== "ENOENT") {
            if (err.code) {
                logger.error("Could not open config file: %s ", err.code);
            } else {
                logger.error("Could not open config file: %s", e);
            }
        }
        logger.warn("Failed to remove plugin from config.json");
    }

    logger.info("Uninstalled plugin!");
}

async function runInfo() {
    const logger = new Logger;

    const argvPluginName = process.argv[3];

    if (!argvPluginName) {
        logger.error("Expected plugin name as an argument, usage: `yarn plugins info <plugin name>`.");
        return;
    }

    const pluginName = argvPluginName.startsWith("hbplugin-")
        ? argvPluginName
        : "hbplugin-" + argvPluginName;

    const packageInfoJson = await getPackageInfo(process.cwd(), pluginName, logger);

    if (!packageInfoJson)
        return;

    let pluginType: "worker"|"room"|undefined = undefined;
    let pluginVersion = packageInfoJson.version;

    const localInstallation = new Spinner("Checking for local installation.. %s").start();
    for (const pluginsDirectory of pluginsDirectories) {
        try {
            const packageLocation = resolveFrom(pluginsDirectory, packageInfoJson.name);
            const { default: importedPlugin } = await import(packageLocation);

            if (!importedPlugin || !PluginLoader.isHindenburgPlugin(importedPlugin)) {
                throw 0;
            }

            if (PluginLoader.isWorkerPlugin(importedPlugin)) {
                pluginType = "worker";
            } else if (PluginLoader.isRoomPlugin(importedPlugin)) {
                pluginType = "room";
            }

            pluginVersion = importedPlugin.meta.version;
            break;
        } catch (e) { continue; }
    }
    localInstallation.success();

    logger.info(chalk.green(packageInfoJson.name) + chalk.gray("@v" + pluginVersion));
    if (packageInfoJson.maintainers[0]) {
        let authorText = "- by " + chalk.green(packageInfoJson.maintainers[0].name);
        if (packageInfoJson.maintainers[0].email) {
            authorText += chalk.grey(" (" + packageInfoJson.maintainers[0].email + ")");
        }
        logger.info(authorText);
    }
    logger.info("- last updated " + chalk.green(packageInfoJson.time[packageInfoJson.version]));
    if (pluginType === "worker") {
        logger.info("- Worker plugin");
    } else if (pluginType === "room") {
        logger.info("- Room plugin");
    }
}

async function runList() {
    const logger = new Logger;

    const allInstalledPlugins = [];
    for (const pluginsDirectory of pluginsDirectories) {
        logger.info("Fetching from '%s'..", chalk.grey(pluginsDirectory));

        const resolveNpmSpinner = new Spinner("Resolving NPM plugins.. %s").start();
        try {
            const packageJson = await fs.readFile(path.join(pluginsDirectory, "package.json"), "utf8");
            const json = JSON.parse(packageJson);

            for (const depenencyName in json.dependencies) {
                allInstalledPlugins.push({
                    name: depenencyName,
                    type: "npm"
                });
            }

            resolveNpmSpinner.success();
        } catch (e) {
            resolveNpmSpinner.fail();
            if ((e as { code: string }).code === "ENOENT") {
                return;
            }
            logger.error("Failed to resovle npm plugins: %s", (e as any).message || e);
            continue;
        }

        const resolveLocalSpinner = new Spinner("Resolving local plugins..").success();
        try {
            const files = await fs.readdir(pluginsDirectory);
            for (const file of files) {
                if (!file.startsWith("hbplugin-"))
                    continue;

                allInstalledPlugins.push({
                    name: path.basename(path.basename(file, ".ts"), ".js"),
                    type: "local"
                });
            }
            resolveLocalSpinner.success();
        } catch (e) {
            resolveLocalSpinner.fail();
            logger.error("Could not read plugin directory: %s", (e as any).code || e);
            continue;
        }
    }

    logger.info("%s plugin%s installed",
        chalk.blueBright(allInstalledPlugins.length), allInstalledPlugins.length === 1 ? "" : "s");
    for (let i = 0; i < allInstalledPlugins.length; i++) {
        const installedPlugin = allInstalledPlugins[i];
        logger.info("%s) %s (%s)",
            i + 1, chalk.green(installedPlugin.name), installedPlugin.type);
    }
}

(async () => {
    const logger = new Logger;

    logger.info("Found plugins directory: %s", chalk.grey(pluginsDirectories));

    const action = process.argv[2];

    switch (action) {
    case "create":
        await runCreatePlugin();
        break;
    case "install":
        await runInstallPlugin();
        break;
    case "import":
        await runImportPlugin();
        break;
    case "uninstall":
        await runUninstallPlugin();
        break;
    case "info":
        await runInfo();
        break;
    case "list":
        await runList();
        break;
    default:
        console.log("Usage: yarn plugins <action>");
        console.log("       yarn plugins init [ts] <plugin name>" + chalk.gray("# initialise a new plugin"));
        console.log("       yarn plugins install   <plugin name>" + chalk.gray("# install a plugin from the npm registry"));
        console.log("       yarn plugins import    <plugin repo>" + chalk.gray("# import a plugin from a git repository"));
        console.log("       yarn plugins uninstall <plugin name>" + chalk.gray("# remove a plugin installed via npm"));
        console.log("       yarn plugins info      <plugin name>" + chalk.gray("# get information about a plugin"));
        console.log("       yarn plugins list                   " + chalk.gray("# list all installed plugins"));
        console.error("Expected 'action' to be one of 'install', 'uninstall', 'list', or 'create'.");
        break;
    }

    const configSchemaSpinner = new Spinner("Updating config schema.. %s");
    try {
        await createSchema();
        configSchemaSpinner.success();
    } catch (e) {
        configSchemaSpinner.fail();
        logger.error("Failed to update config.schema.json: %s", (e as { code: string }).code || e);
    }
})();
