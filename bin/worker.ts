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

const configFile = process.env.HINDENBURG_CONFIG || path.join(process.cwd(), "./config.json");
async function resolveConfig(logger: Logger): Promise<DeepPartial<HindenburgConfig>> {
    try {
        return JSON.parse(await fs.readFile(configFile, "utf8"));
    } catch (e) {
        const err = e as { code: string };
        if (err.code === "ENOENT") {
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
            const configPath = argv[i].substr(2);
            const cmdValue = argv[i + 1];

            if (!cmdValue) {
                continue;
            }

            const configValue = JSON.parse(cmdValue);

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
    }
}

(async () => {
    const logger = new Logger;
    const internalIp = await getInternalIp();

    const workerConfig = createDefaultConfig();
    const resolvedConfig = await resolveConfig(logger);
    recursiveAssign(workerConfig, resolvedConfig || {});
    applyCommandLineArgs(workerConfig);
    const externalIp = await fetchExternalIp(logger);
    if (workerConfig.socket.ip === "auto") {
        workerConfig.socket.ip = externalIp;
    }

    if (workerConfig.checkForUpdates) {
        await checkForUpdates(logger, workerConfig.autoUpdate);
    }

    const pluginsDirectories: string[] = process.env.HINDENBURG_PLUGINS?.split(",").map(x => x.trim()) || [ path.resolve(process.cwd(), "./plugins") ];
    const worker = new Worker("TEST", 0, workerConfig, pluginsDirectories);

    if (!resolvedConfig) {
        worker.logger.warn("Cannot open config file; using default config");
    }

    const port = worker.config.socket.port;
    await worker.listen(port);

    worker.logger.info("Listening on:");

    if (!worker.config.logging.hideSensitiveInfo) {
        worker.logger.info(chalk.grey`External: ${chalk.white(externalIp)}:${port}`);
    }
    worker.logger.info(chalk.grey`Internal: ${chalk.white(internalIp)}:${port}`);
    worker.logger.info(chalk.grey`   Local: ${chalk.white("127.0.0.1")}:${port}`);

    if (worker.config.plugins.loadDirectory) {
        await worker.pluginLoader.importFromDirectory();
        await worker.pluginLoader.loadAllWorkerPlugins();
    }

    const configWatch = chokidar.watch(configFile, {
        persistent: false
    });

    configWatch.on("change", async () => {
        worker.logger.info("Config file updated, reloading..");
        try {
            const workerConfig = createDefaultConfig();
            const updatedConfig = JSON.parse(await fs.readFile(configFile, "utf8"));
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
