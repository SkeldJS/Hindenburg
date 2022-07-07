import "./modulePatch";

import dotenv from "dotenv";
dotenv.config();

import https from "https";
import net from "net";
import path from "path";
import fs from "fs/promises";

import compareVersions from "compare-versions";
import chalk from "chalk";
import chokidar from "chokidar";

import { Spinner } from "./util/Spinner";
import { runCommandInDir } from "./util/runCommandInDir";

import { Worker as FakeWorker, HindenburgConfig, Logger } from "../src";
import { createDefaultConfig } from "./createDefaultConfig";
import { recursiveAssign } from "../src/util/recursiveAssign";

let Worker = FakeWorker;

type DeepPartial<T> = {
    [K in keyof T]?: DeepPartial<T[K]>|undefined
};

const configFilename = process.env.HINDENBURG_CONFIG || path.join(process.cwd(), "./config.json");
async function resolveConfig(logger: Logger, configFilename: string, performSetup: boolean): Promise<DeepPartial<HindenburgConfig>> {
    try {
        const configJson: DeepPartial<HindenburgConfig> = JSON.parse(await fs.readFile(configFilename, "utf8"));

        if (configJson.extends) {
            const extendedFrom: DeepPartial<HindenburgConfig> = {};

            if (Array.isArray(configJson.extends)) {
                for (const extendedFilename of configJson.extends) {
                    if (extendedFilename) {
                        const resolvedExtended = await resolveConfig(logger, path.resolve(path.dirname(configFilename), extendedFilename), false);
                        recursiveAssign(extendedFrom, resolvedExtended);
                    }
                }
            } else {
                const resolvedExtended = await resolveConfig(logger, path.resolve(path.dirname(configFilename), configJson.extends), false);
                recursiveAssign(extendedFrom, resolvedExtended);
            }

            recursiveAssign(extendedFrom, configJson);
            return extendedFrom;
        }

        return configJson;
    } catch (e) {
        const err = e as { code: string };
        if (err.code === "ENOENT" && performSetup) {
            logger.warn("No config file found; performing first-time setup accepting all defaults..");
            return (await (await import("./_setup")).default(true)) as DeepPartial<HindenburgConfig>;
        }
        logger.error("Failed to read config: %s", err.code || e);
        return {};
    }
}

function splitExceptInQuotes(str: string) {
    const out: string[] = [];
    let accu = "";
    let in_quotes = false;
    let in_escape = false;
    for (let i = 0; i < str.length; i++) {
        if (str[i] === "\\") {
            in_escape = !in_escape;
            continue;
        }
        if (str[i] === "\"" || str[i] === "'" && !in_escape) {
            in_quotes = !in_quotes;
        } else if (str[i] === " " && !in_quotes && !in_escape) {
            out.push(accu);
            accu = "";
        } else {
            accu += str[i];
        }
        in_escape = false;
    }
    out.push(accu);
    return out;
}

function applyCommandLineArgs(config: HindenburgConfig) {
    const HINDENBURG_CLI_ARGS = process.env.HINDENBURG_CLI_ARGS || "";
    const argv = [...process.argv.slice(2), ...splitExceptInQuotes(HINDENBURG_CLI_ARGS)];

    for (let i = 0; i < argv.length; i++) {
        if (argv[i].startsWith("--")) {
            const configPath = argv[i].substring(2);
            const cmdValue = argv[i + 1];

            if (!cmdValue) {
                continue;
            }

            const configValue = cmdValue === "false"
                ? false
                : cmdValue === "true"
                    ? true
                    : cmdValue.startsWith("[")
                        ? JSON.parse(cmdValue)
                        : Number(cmdValue)
                        || cmdValue;

            const pathParts = [];
            let acc = "";
            for (let i = 0; i < configPath.length; i++) {
                if (configPath[i] === ".") {
                    if (acc) {
                        pathParts.push(acc);
                        acc = "";
                    }
                } else if (configPath[i] === "[") {
                    pathParts.push(acc);
                    acc = "";
                    let computed = "";
                    for (let j = i + 1; j < configPath.length; j++) {
                        if (configPath[j] === "]") {
                            i = j;
                            break;
                        }

                        computed += configPath[j];
                    }
                    acc += computed;
                } else {
                    acc += configPath[i];
                }
            }
            if (acc) {
                pathParts.push(acc);
                acc = "";
            }

            let curObj: any = config;
            for (let i = 0; i < pathParts.length - 1; i++) {
                if (typeof curObj[pathParts[i]] !== "object") {
                    curObj[pathParts[i]] = {};
                }

                curObj = curObj[pathParts[i]];
            }

            curObj[pathParts[pathParts.length - 1]] = configValue;
        }
    }
}

function makeHttpRequest(url: string) {
    return new Promise<Buffer>((resolve, reject) => {
        const req = https.get(url, res => {
            if (res.statusCode !== 200) {
                return reject("Got non-200 status code for " + url + ": " + res.statusCode);
            }
            const buffers: Buffer[] = [];
            res.on("data", data => {
                buffers.push(data);
            });
            res.on("end", () => {
                const fullData = Buffer.concat(buffers);
                resolve(fullData);
            });
            res.on("error", e => {
                reject(e);
            });
        });
        req.end();
    });
}

async function getLatestVersion() {
    const fullData = await makeHttpRequest("https://raw.githubusercontent.com/SkeldJS/Hindenburg/master/package.json");
    const json = JSON.parse(fullData.toString("utf8"));
    if (json.version) {
        return json.version;
    }
}

async function getChangelog() {
    const fullData = await makeHttpRequest("https://raw.githubusercontent.com/SkeldJS/Hindenburg/master/changelog.json");
    const json = JSON.parse(fullData.toString("utf8"));
    if (json) {
        return json;
    }
}

let cachedIp: string;
async function fetchExternalIp(logger: Logger) {
    if (cachedIp)
        return cachedIp;

    const ipSpinner = new Spinner("Fetching ip address.. %s").start();
    try {
        cachedIp = (await makeHttpRequest("https://api.ipify.org")).toString("utf8");
        cachedIp = cachedIp.toString().trim();
        ipSpinner.success();
    } catch (e) {
        ipSpinner.fail();
        logger.warn("Failed to get ip address, please enter it manually in the config.socket.ip option.");
    }

    return cachedIp;
}

async function getInternalIp() {
    return new Promise((resolve, reject) => {
        const socket = net.createConnection(80, "api.ipify.org");
        socket.on("connect", function() {
            resolve((socket.address() as net.AddressInfo).address);
            socket.end();
        });
        socket.on("error", function(e) {
            reject(e);
            socket.end();
        });
    });
}

async function fetchUpdates(logger: Logger) {
    const gitPullSpinner = new Spinner("Pulling from remote repository.. %s").start();
    try {
        await runCommandInDir(process.cwd(), "git pull origin master");
        gitPullSpinner.success();

        const installSpinner = new Spinner("Updating dependencies.. %s").start();
        try {
            await runCommandInDir(process.cwd(), "yarn");
            installSpinner.fail();

            const yarnBuildSpinner = new Spinner("Building.. %s").start();

            try {
                await runCommandInDir(process.cwd(), "yarn build");
                yarnBuildSpinner.success();

                delete require.cache[require.resolve("../src")];

                // eslint-disable-next-line no-global-assign
                Worker = (await import("../src")).Worker;
            } catch (e) {
                yarnBuildSpinner.fail();
                logger.error("Failed to build latest changes, use 'yarn build' to update manually.");
            }
        } catch (e) {
            installSpinner.fail();
            logger.error("Failed to install dependencies, use 'yarn' and 'yarn build' to update manually.");
        }
    } catch (e) {
        gitPullSpinner.fail();
        logger.error("Failed to pull latest changes, use 'git pull', 'yarn' and 'yarn build' to update manually.");
    }
}

export interface ChangelogJson {
    [K: string]: {
        version: string;
        contributors: string;
        date: string;
        notes: {
            description: string;
            commits: string[]
        }[];
    }
}

async function checkForUpdates(logger: Logger, autoUpdate: boolean) {
    if (process.env.IS_PKG)
        return logger.warn("Auto-updating disabled when using server executable");

    const versionSpinner = new Spinner("Checking for updates.. %s").start();

    try {
        const latestVersion = await getLatestVersion();
        const compare = compareVersions(latestVersion, process.env.npm_package_version as string);

        if (compare === 1) {
            let changelog: ChangelogJson|undefined;
            try {
                changelog = await getChangelog();
            } catch (e) {
                logger.warn("Failed to fetch changelogs");
            }

            versionSpinner.success();

            if (autoUpdate) {
                logger.info(chalk.yellow("New version of Hindenburg available: %s, updating.."), latestVersion);
                await fetchUpdates(logger);
            } else {
                logger.info(chalk.yellow("New version of Hindenburg available: %s, use 'git pull && yarn build' to update"), latestVersion);
            }

            if (changelog && changelog[latestVersion]) {
                logger.info(chalk.yellow("Change logs for version %s (%s):"), changelog[latestVersion].version, changelog[latestVersion].date);
                for (const note of changelog[latestVersion].notes) {
                    logger.info(chalk.yellow(" - %s (%s)"), note.description, note.commits.map(commit => commit.substr(0, 7)).join(", "));
                }
            }
        }
        versionSpinner.success();
    } catch (e) {
        versionSpinner.fail();
        logger.error("Failed to check for updates, nevermind");
        logger.error("Error: %s", e as Error);
    }
}

async function checkConfigDeprecations(config: HindenburgConfig, configFilename: string, logger: Logger) {
    let flag = false;
    if ("broadcastUnknownGameData" in config.socket) {
        config.socket.acceptUnknownGameData = (config as any).socket.broadcastUnknownGameData;
        delete (config as any).socket.broadcastUnknownGameData;
        logger.warn("Config deprecation: 'socket.broadcastUnknownGameData' has been renamed to 'socket.acceptUnknownGameData' to better reflect its purpose");
        flag = true;
    }
    if (config.rooms.advanced.unknownObjects && config.rooms.serverAsHost) {
        logger.warn("Server-as-a-Host may not function properly with unknown objects allowed; consider writing object logic with a plugin or remove rooms.advanced.unknownObjects in the config");
    }
    if (flag) {
        const configSpinner = new Spinner("Writing config to reflect deprecations.. %s");
        try {
            await fs.writeFile(
                configFilename,
                JSON.stringify({ $schema: "./config.schema.json", ...config }, undefined, 4),
                "utf8"
            );
            configSpinner.success();
        } catch (e) {
            configSpinner.fail();
            logger.error("Failed to update config.json: %s", (e as { code: string }).code || e);
        }
    }
    return;
}

(async () => {
    const logger = new Logger("Startup");
    const internalIp = await getInternalIp();

    const workerConfig = createDefaultConfig();
    const resolvedConfig = await resolveConfig(logger, configFilename, true);
    recursiveAssign(workerConfig, resolvedConfig || {});
    applyCommandLineArgs(workerConfig);
    const externalIp = await fetchExternalIp(logger);
    if (workerConfig.socket.ip === "auto") {
        workerConfig.socket.ip = externalIp;
    }
    checkConfigDeprecations(workerConfig, configFilename, logger);

    if (workerConfig.checkForUpdates) {
        await checkForUpdates(logger, workerConfig.autoUpdate);
    }

    const pluginsDirectories: string[] = process.env.HINDENBURG_PLUGINS?.split(",").map(x => x.trim()) || [ path.resolve(process.cwd(), "./plugins") ];
    const worker = new Worker("TEST", 0, workerConfig, pluginsDirectories);

    if (!resolvedConfig) {
        worker.logger.warn("Cannot open config file; using default config");
    }

    worker.listen();
    worker.logger.info("");
    worker.logger.info("Listening on:");

    const listeningPort = worker.matchmaker?.port || worker.config.socket.port;
    if (!worker.config.logging.hideSensitiveInfo) {
        worker.logger.info(chalk.grey`External: ${chalk.white(externalIp)}:${listeningPort}`);
    }
    worker.logger.info(chalk.grey`Internal: ${chalk.white(internalIp)}:${listeningPort}`);
    worker.logger.info(chalk.grey`   Local: ${chalk.white("localhost")}:${listeningPort}`);
    worker.logger.info("");

    if (worker.config.plugins.loadDirectory) {
        await worker.pluginLoader.importFromDirectories();
        await worker.pluginLoader.loadAllWorkerPlugins();
    }

    const configWatch = chokidar.watch(configFilename, {
        persistent: false
    });

    configWatch.on("change", async () => {
        worker.logger.info("Config file updated, reloading..");
        try {
            const workerConfig = createDefaultConfig();
            const updatedConfig = JSON.parse(await fs.readFile(configFilename, "utf8"));
            recursiveAssign(workerConfig, updatedConfig || {});
            applyCommandLineArgs(workerConfig);
            if (workerConfig.socket.ip === "auto") {
                workerConfig.socket.ip = await fetchExternalIp(logger);
            }

            worker.updateConfig(workerConfig);
        } catch (e) {
            const err = e as { code: string };
            if (err.code) {
                worker.logger.warn("Cannot open config file (%s); not reloading config.", err.code);
            }
        }
    });
})();
