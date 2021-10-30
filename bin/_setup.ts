import path from "path";
import fs from "fs/promises";

import prompts from "prompts";

import { Spinner } from "./util/Spinner";
import { runCommandInDir } from "./util/runCommandInDir";
import { Logger } from "../src/logger";
import { createDefaultConfig } from "./createDefaultConfig";

async function doesExist(path: string) {
    try {
        await fs.stat(path);
        return true;
    } catch (e) {
        return false;
    }
}

const defaultPackageJson = {
    dependencies: {
        "hbplugin-ban-textfile": "latest"
    }
};

const pluginsDirectories: string[] = process.env.HINDENBURG_PLUGINS?.split(",").map(x => x.trim()) || [ path.resolve(process.cwd(), "./plugins") ];
const configFile = process.env.HINDENBURG_CONFIG || path.join(process.cwd(), "./config.json");

export default (async (useDefault: boolean) => {
    const logger = new Logger;

    for (let i = 0; i < pluginsDirectories.length; i++) {
        const pluginsDirectory = pluginsDirectories[i];

        logger.info("Checking plugin directory '%s'..", pluginsDirectory);

        const yarnLockFile = path.join(pluginsDirectory, "yarn.lock");

        const packageJsonFile = path.join(pluginsDirectory, "package.json");
        const pluginsSpinner = new Spinner("Creating plugins directory.. %s").start();
        if (!await doesExist(pluginsDirectory)) {
            try {
                await fs.mkdir(pluginsDirectory);
                await fs.writeFile(yarnLockFile, "", "utf8");
                await fs.writeFile(packageJsonFile, JSON.stringify(defaultPackageJson, undefined, 4), "utf8");
            } catch (e) {
                pluginsSpinner.fail();
                logger.error("Failed to create plugins directory: %s", e);
                continue;
            }
        }

        if (!await doesExist(yarnLockFile)) {
            try {
                await fs.writeFile(yarnLockFile, "", "utf8");
            } catch (e) {
                pluginsSpinner.fail();
                logger.error("Failed to create plugins directory: %s", e);
                continue;
            }
        }

        if (!await doesExist(packageJsonFile)) {
            try {
                await fs.writeFile(
                    packageJsonFile,
                    JSON.stringify(defaultPackageJson, undefined, 4),
                    "utf8"
                );
            } catch (e) {
                pluginsSpinner.fail();
                logger.error("Failed to create plugins directory: %s", e);
                continue;
            }
        }
        pluginsSpinner.success();

        const installingSpinner = new Spinner("Installing plugins.. %s").start();
        try {
            await runCommandInDir(pluginsDirectory, "yarn install");
            installingSpinner.success();
        } catch (e) {
            installingSpinner.fail();
        }
    }

    let flag = false;
    if (await doesExist(configFile)) {
        const verifySpinner = new Spinner("Verifying config.json.. %s").start();
        let configJsonData;
        try {
            configJsonData = await fs.readFile(configFile, "utf8");

            try {
                JSON.parse(configJsonData as string);
                verifySpinner.success();
            } catch (e) {
                verifySpinner.fail();
                flag = true;
            }
        } catch (e) {
            verifySpinner.fail();
            logger.error("Failed to read config.json: %s", (e as { code: string }).code || e);
            flag = true;
        }
    } else {
        flag = true;
    }

    if (flag) {
        if (useDefault) {
            const defaultConfig = createDefaultConfig();
            (defaultConfig as any)["$schema"] = "./misc/config.schema.json";

            const configSpinner = new Spinner("Writing config.. %s");
            try {
                await fs.writeFile(
                    configFile,
                    JSON.stringify(defaultConfig, undefined, 4),
                    "utf8"
                );
                configSpinner.success();
            } catch (e) {
                configSpinner.fail();
                logger.error("Failed to create config.json: %s", (e as { code: string }).code || e);
            }
            return;
        }

        const defaultConfig = createDefaultConfig();

        const { reactorSupport } = await prompts({
            type: "confirm",
            name: "reactorSupport",
            message: "Support for Reactor modded clients?",
            initial: true
        });

        const { enableSaaH } = await prompts({
            type: "confirm",
            name: "enableSaaH",
            message: "Enable Server-As-A-Host?",
            initial: false
        });

        const { useChatCommands } = await prompts({
            type: "confirm",
            name: "useChatCommands",
            message: "Enable chat commands?",
            initial: true
        });

        const { hideSensitiveInfo } = await prompts({
            type: "confirm",
            name: "hideSensitiveInfo",
            message: "Hide sensitive logging info?",
            initial: true
        });

        if (!reactorSupport) {
            defaultConfig.reactor = false;
        }

        if (enableSaaH) {
            defaultConfig.rooms.serverAsHost = true;
        }

        if (!useChatCommands) {
            defaultConfig.rooms.chatCommands = false;
        }

        if (hideSensitiveInfo) {
            defaultConfig.logging.hideSensitiveInfo = true;
        }

        const configSpinner = new Spinner("Writing config.. %s");
        try {
            await fs.writeFile(
                configFile,
                JSON.stringify({ $schema: path.relative(path.dirname(configFile), path.resolve(__dirname, "../misc/config.schema.json")), ...defaultConfig }, undefined, 4),
                "utf8"
            );
            configSpinner.success();
        } catch (e) {
            configSpinner.fail();
            logger.error("Failed to create config.json: %s", (e as { code: string }).code || e);
        }

        return defaultConfig;
    }
});
