import "./modulePatch";

import path from "path";
import fs from "fs/promises";

import chalk from "chalk";
import prompts from "prompts";
import resolvePkg from "resolve-pkg";
import * as queryRegistry from "query-registry";

import pluginGitignore from "./resources/plugin-gitignore";

import { Logger } from "../src/logger";
import { PluginLoader } from "../src/handlers";
import { runCommandInDir } from "./util/runCommandInDir";
import { Spinner } from "./util/Spinner";
import createSchema from "./createSchema";
import { importPlugin } from "./importPlugin";

const pluginsDirectories: string[] = process.env.HINDENBURG_PLUGINS?.split(",").map(x => x.trim()) || [ path.resolve(process.cwd(), "./plugins") ];
const configFile: string = process.env.HINDENBURG_CONFIG || path.join(process.cwd(), "./config.json");

const yarnCommand = process.env.IS_PKG ?
    "node \"" + path.join(__dirname, "../../build/yarn/bin/yarn.js") + "\""
    : "yarn";

const baseHindenburgCommand = process.env.IS_PKG ? process.env.PKG_EXE_BASENAME : "yarn";

async function buildHindenburg(logger: Logger) {
    const buildSpinner = new Spinner("Building Hindenburg.. %s").start();
    try {
        await runCommandInDir(process.cwd(), yarnCommand + " build");
        buildSpinner.success();
        return true;
    } catch (e) {
        buildSpinner.fail();
        logger.error("Failed to build Hindenburg, you will have to build both Hindenburg and your plugin later");
        return false;
    }
}

async function checkGitInstallation() {
    try {
        await runCommandInDir(process.cwd(), "git help -g");
        return true;
    } catch (e) {
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
} ${isTypescript ? "from " : "= require("}"@skeldjs/hindenburg"${isTypescript ? "" : ")"};${isTypescript ? `

export interface ${codeFriendlyName}Config {
    message: string;
}` : ""}

@HindenburgPlugin("${pluginName}")
export class ${codeFriendlyName} extends ${pluginType === "worker" ? "WorkerPlugin" : "RoomPlugin"} {
    ${isTypescript ? "message: string;\n\n    " : ""}constructor(public readonly ${pluginType}${isTypescript ? ": " + (pluginType === "worker" ? "Worker" : "Room") : ""}, public config${isTypescript ? ": " + codeFriendlyName + "Config" : ""}) {
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
}\n`;
}

async function getPackageInfo(pluginsDirectory: string, packageName: string, logger: Logger) {
    const pluginInfoSpinner = new Spinner("Fetching plugin information.. %s").start();
    try {
        const withoutVersion = packageName.replace(/@.+/, "");
        const packageInfoData = await queryRegistry.getPackument({ name: withoutVersion });
        const packageJsonData = await queryRegistry.getPackageManifest({ name: withoutVersion });
        console.log(packageJsonData);
        pluginInfoSpinner.success();
        return { ...packageInfoData, ...packageJsonData };
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
        }
        throw e;
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
        logger.error("Expected plugin name as an argument, usage: `" + baseHindenburgCommand + " plugins create <plugiun name>`.");
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
            logger.error("Plugins directory found but was not a directory, please delete the file and run '" + baseHindenburgCommand + " setup'");
            return;
        }
    } catch (e) {
        logger.error("Plugins directory not found or inaccessible, please run '" + baseHindenburgCommand + " setup'");
        return;
    }

    const codeFriendlyName = getCodeFriendlyPluginName(pluginName);
    const pluginDirectory = path.resolve(pluginsDirectory, pluginName);

    try {
        await fs.stat(pluginDirectory);
        logger.error("Plugin already exists: " + pluginName);
        return;
    } catch (e) { void e; }


    const checkingGitInstallationSpinner = new Spinner("Checking git installation..");
    const isGitInstalled = await checkGitInstallation();
    checkingGitInstallationSpinner.stop(isGitInstalled);
    if (!isGitInstalled) {
        logger.warn("Git not installed, some features will be disabled");
    }

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


    const { createGit } = isGitInstalled ? await prompts({
        type: "confirm",
        name: "createGit",
        message: "Create Git repository?",
        initial: true
    }) : { createGit: false };

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

    let localAuthorDetails: { name: string; email: string }|undefined = undefined;
    if (isGitInstalled) {
        const fetchingAuthorDetails = new Spinner("Fetching author details.. %s").start();
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
                localAuthorDetails = {
                    name: gitConfigUsername.trim(),
                    email: gitConfigEmail.trim()
                };
            }
        } catch (e) {
            fetchingAuthorDetails.fail();
            logger.warn("Couldn't get any details, nevermind.");
        }
    }

    const buildSucceeded = process.env.IS_PKG || !useTypescript || await buildHindenburg(logger);

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
            await runCommandInDir(pluginDirectory, yarnCommand + " init -y");
            await fs.writeFile(path.resolve(pluginDirectory, "yarn.lock"), "\n", "utf8");
            yarnSpinner.success();
        } catch (e) {
            yarnSpinner.fail();
            logger.error("Failed to initialise yarn");
            const deleteSpinner = new Spinner("Deleting directory.. %s").start();
            try {
                await runCommandInDir(
                    pluginsDirectory,
                    yarnCommand + " exec rm -r " + pluginDirectory
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
            await runCommandInDir(pluginDirectory, yarnCommand + " set version berry");
            await runCommandInDir(pluginDirectory, yarnCommand + " config set nodeLinker node-modules");
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
                    yarnCommand + " exec rm -r " + pluginDirectory
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
                    yarnCommand + " exec rm -r " + pluginDirectory
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
        // const relativeHindenburg = path.relative(pluginDirectory, process.cwd()).replace(/\\/g, path.posix.sep);
        if (packageManager === "yarn") {
            await runCommandInDir(
                pluginDirectory,
                yarnCommand + " add --dev @skeldjs/hindenburg"
                    + (useTypescript ? " typescript@latest" : "")
            );
        } else if (packageManager === "npm") {
            await runCommandInDir(
                pluginDirectory,
                "npm install --save-dev @skeldjs/hindenburg"
                    + (useTypescript ? " typescript@latest" : "")
            );
        } else if (packageManager === "pnpm") {
            await runCommandInDir(
                pluginDirectory,
                "pnpm install --save-dev @skeldjs/hindenburg"
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
                yarnCommand + " exec rm -r " + pluginDirectory
            );
            deleteSpinner.success();
        } catch (e) {
            deleteSpinner.fail();
        }
        throw e;
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
                }, undefined, 2) + "\n",
                "utf8"
            );
        }

        packageJson.version = "1.0.0";
        packageJson.description = "My cool Hindenburg plugin";
        packageJson.keywords = [ "hindenburg", "plugin", "among us" ];
        packageJson.license = "GPL-3.0-only";
        if (localAuthorDetails) {
            packageJson.author = localAuthorDetails;
        }
        if (useTypescript) {
            packageJson.files = [ "dist", "config.schema.json" ];
        } else {
            packageJson.files = [ "src", "index.js", "config.schema.json" ];
        }
        packageJson.main = useTypescript ? "./dist/index.js" : "./index.js";
        if (useTypescript) {
            packageJson.types = "./index.ts";
            packageJson.publishConfig = {
                types: "./dist/index.d.ts"
            };
        }
        packageJson.scripts = {
            publish: yarnCommand + " npm publish --access public"
        };
        if (useTypescript) {
            packageJson.scripts.build = "tsc --project ./";
            packageJson.scripts.watch = "tsc --watch --project ./";
            if (packageManager === "yarn") {
                packageJson.scripts.prepack = yarnCommand + " build";
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
            defaultConfig: {
                message: "Hello, world!"
            }
        };

        await fs.writeFile(
            packageJsonFile,
            JSON.stringify(packageJson, undefined, 2) + "\n",
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
                yarnCommand + " exec rm -r " + pluginDirectory
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
        await fs.writeFile(path.resolve(pluginDirectory, "config.schema.json"), `{
    "properties": {
        "message": {
            "type": "string"
        }
    }
}
`, "utf8");
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
export default ${codeFriendlyName};
`,
            "utf8"
        );
        await fs.writeFile(
            path.resolve(pluginDirectory, "src", useTypescript ? "index.ts" : "index.js"),
            "export * from \"./plugin\";\n",
            "utf8"
        );
        await fs.writeFile(
            path.resolve(pluginDirectory, "src", useTypescript ? "plugin.ts" : "plugin.js"),
            createHelloWorldPlugin(pluginName, useTypescript, pluginType) + "\n",
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
                yarnCommand + " exec rm -r " + pluginDirectory
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
                await runCommandInDir(pluginDirectory, yarnCommand + " build");
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

async function verifyInstalledPlugin(logger: Logger, pluginsDirectory: string, packageFilename: string) {
    const verifySpinner = new Spinner("Verifying installed plugin.. %s").start();
    try {
        const packageLocation = packageFilename.startsWith("./")
            ? path.resolve(pluginsDirectory, packageFilename)
            : resolvePkg(packageFilename, { cwd: pluginsDirectory });

        if (!packageLocation)
            throw new Error("Not a valid package directory");

        const importedPlugin = await importPlugin(packageLocation);

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
                JSON.stringify(configJson, undefined, 4) + "\n",
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
            logger.error("Plugins directory found but was not a directory, please delete the file and run '" + baseHindenburgCommand + " setup'");
            return;
        }
    } catch (e) {
        logger.error("Plugins directory not found or inaccessible, please run '" + baseHindenburgCommand + " setup'");
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

    const version = pluginName.split("@")[1];

    let installingText = "Installing " + chalk.green(packageInfoJson.name) + chalk.gray("@v" + version);
    if (packageInfoJson.maintainers?.[0]) {
        installingText += " by " + packageInfoJson.maintainers[0].name;
    }
    installingText += ".. %s";

    const installingSpinner = new Spinner(installingText).start();
    try {
        await runCommandInDir(pluginsDirectory, yarnCommand + " add " + packageInfoJson.name + "@" + version + " --json");
        installingSpinner.success();
    } catch (e) {
        installingSpinner.fail();
        logger.error("Failed to install plugin package.");
        return;
    }

    if (!await verifyInstalledPlugin(logger, pluginsDirectory, packageInfoJson.name)) {
        const uninstallSpinner = new Spinner("Uninstalling invalid plugin.. %s");
        try {
            await runCommandInDir(pluginsDirectory, yarnCommand + " remove " + packageInfoJson.name);
            uninstallSpinner.success();
        } catch (e) {
            uninstallSpinner.fail();
            logger.error("Failed to uninstall package, run either '" + baseHindenburgCommand + " plugins uninstall \"" + packageInfoJson + "\"', or enter the directory manually and run 'yarn remove \"" + packageInfoJson.name + "\"'");
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
            logger.error("Plugins directory found but was not a directory, please delete the file and run '" + baseHindenburgCommand + " setup'");
            return;
        }
    } catch (e) {
        logger.error("Plugins directory not found or inaccessible, please run '" + baseHindenburgCommand + " setup'");
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
                yarnCommand + " exec rm -r " + pluginDirectory
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
                        await runCommandInDir(pluginDirectory, yarnCommand + " build");
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
                yarnCommand + " exec rm -r " + pluginDirectory
            );
            deleteSpinner.success();
        } catch (e) {
            deleteSpinner.fail();
        }
        console.log(e);
        return;
    }

    if (!await verifyInstalledPlugin(logger, pluginsDirectory, "./" + pluginDirectoryName)) {
        const deleteSpinner = new Spinner("Deleting directory.. %s").start();
        try {
            await runCommandInDir(
                pluginsDirectory,
                yarnCommand + " exec rm -r " + pluginDirectory
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
            logger.error("Plugins directory found but was not a directory, please delete the file and run '" + baseHindenburgCommand + " setup'");
            return;
        }
    } catch (e) {
        logger.error("Plugins directory not found or inaccessible, please run '" + baseHindenburgCommand + " setup'");
        return;
    }

    const pluginName = argvPluginName.startsWith("hbplugin-")
        ? argvPluginName
        : "hbplugin-" + argvPluginName;

    const resolvingPlugin = new Spinner("Resolving plugin.. %s").start();

    const pluginDirectory = path.resolve(pluginsDirectory, pluginName);
    try {
        await fs.stat(pluginDirectory);
        resolvingPlugin.fail();
        logger.error("Plugin is a local folder, not installed with NPM, please delete the folder manually.");
        return;
    } catch (e) { void e; }

    const packageDirectory = resolvePkg(pluginName, { cwd: pluginsDirectory });
    if (!packageDirectory) {
        resolvingPlugin.fail();
        logger.error("Plugin with name '%s' not installed or inaccessible", pluginName);
        return;
    }

    resolvingPlugin.success();

    const uninstallingSpinner = new Spinner("Uninstalling plugin.. %s").start();
    try {
        await runCommandInDir(pluginsDirectory, yarnCommand + " remove " + pluginName);
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
            JSON.stringify(configJson, undefined, 4) + "\n",
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
            const packageLocation = resolvePkg(packageInfoJson.name, { cwd: pluginsDirectory });

            if (!packageLocation)
                continue;

            const importedPlugin = await importPlugin(packageLocation);

            if (!importedPlugin || !PluginLoader.isHindenburgPlugin(importedPlugin))
                continue;

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
    if (packageInfoJson.author?.name) {
        let authorText = "- by " + chalk.green(packageInfoJson.author.name);
        if (packageInfoJson.author.email) {
            authorText += chalk.grey(" (" + packageInfoJson.author.email + ")");
        }
        logger.info(authorText);
    }
    logger.info("- created at " + chalk.green(packageInfoJson.time.created));
    logger.info("- updated at " + chalk.green(packageInfoJson.time.modified));
    if (pluginType)
        logger.info("- plugin type: " + chalk.green(pluginType));
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
            logger.error("Failed to resolve npm plugins: %s", (e as any).message || e);
            continue;
        }

        const resolveLocalSpinner = new Spinner("Resolving local plugins..");
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
        console.log("Usage: " + baseHindenburgCommand + " plugins <action>");
        console.log("       " + baseHindenburgCommand + " plugins create    <plugin name> " + chalk.gray("# initialise a new plugin"));
        console.log("       " + baseHindenburgCommand + " plugins install   <plugin name> " + chalk.gray("# install a plugin from the npm registry"));
        console.log("       " + baseHindenburgCommand + " plugins import    <plugin repo> " + chalk.gray("# import a plugin from a git repository"));
        console.log("       " + baseHindenburgCommand + " plugins uninstall <plugin name> " + chalk.gray("# remove a plugin installed via npm"));
        console.log("       " + baseHindenburgCommand + " plugins info      <plugin name> " + chalk.gray("# get information about a plugin"));
        console.log("       " + baseHindenburgCommand + " plugins list                    " + chalk.gray("# list all installed plugins"));
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
