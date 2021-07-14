require("./modulePatch");
const path = require("path");
const fs = require("fs");
const https = require("https");
const compareVersions = require("compare-versions");
const chokidar = require("chokidar");

const { createSpinner, stopSpinner, createDefaultConfig, runCommandInDir } = require("./util");
const { Worker } = require("../src");
const { recursiveAssign } = require("../src/util/recursiveAssign");
const chalk = require("chalk");

const configFile = process.env.HINDENBURG_CONFIG || path.join(process.cwd(), "./config.json");
async function resolveConfig() {
    try {
        return JSON.parse(await fs.promises.readFile(configFile, "utf8"));
    } catch (e) {
        return false;
    }
}

function getLatestVersion() {
    return new Promise((resolve, reject) => {
        const req = https.get("https://raw.githubusercontent.com/SkeldJS/Hindenburg/master/package.json", res => {
            const buffers = [];
            res.on("data", data => {
                buffers.push(data);
            });
            res.on("end", () => {
                const fullData = Buffer.concat(buffers);
                try {
                    const json = JSON.parse(fullData.toString("utf8"));
                    if (json.version) {
                        resolve(json.version);
                    }
                } catch (e) {
                    reject(e);
                }
            });
            res.on("error", e => {
                reject(e);
            });
        });
        req.end();
    });
}

(async () => {
    const defaultConfig = createDefaultConfig();
    const resolvedConfig = await resolveConfig();
    recursiveAssign(defaultConfig, resolvedConfig || {});

    const worker = new Worker("TEST", 0, defaultConfig, path.resolve(process.cwd(), "plugins"));

    if (worker.config.checkForUpdates) {
        const versionSpinner = createSpinner("Checking for updates..");
        try {
            const latestVersion = await getLatestVersion();
            const compare = compareVersions(latestVersion, process.env.npm_package_version);
            stopSpinner(versionSpinner, true);
    
            if (compare === 1) {
                if (worker.config.autoUpdate) {
                    console.log(chalk.yellow("New version of Hindenburg available: " + latestVersion));

                    const gitPullSpinner = createSpinner("Running 'git pull'..");
                    try {
                        await runCommandInDir(process.cwd(), "git pull");
                        stopSpinner(gitPullSpinner, true);
                        
                        const yarnBuildSpinner = createSpinner("Running 'yarn build'..");
                        
                        try {
                            await runCommandInDir(process.cwd(), "yarn build");
                            stopSpinner(yarnBuildSpinner, true);

                            console.log(chalk.yellow("Successfully updated, please restart Hindenburg to apply the latest changes"));
                        } catch (e) {
                            stopSpinner(gitPullSpinner, false);
                            console.error("Failed to build latest changes.");
                        }
                    } catch (e) {
                        stopSpinner(gitPullSpinner, false);
                        console.error("Failed to pull latest changes.");
                    }
                } else {
                    console.log(chalk.yellow("New version of Hindenburg available: " + latestVersion + ", use 'git pull && yarn build' to update"));
                }
            } else {
                console.log("Up to date!");
            }
        } catch (e) {
            stopSpinner(versionSpinner, false);
            console.error("Failed to check for updates, nevermind");
        }
    }

    if (!resolvedConfig) {
        worker.logger.warn("Cannot open config file; using default config");
    }

    await worker.listen(worker.config.socket.port);
    
    if (worker.config.plugins.loadDirectory) {
        await worker.pluginLoader.loadFromDirectory();
    }

    const configWatch = chokidar.watch(configFile, {
        persistent: false,
        encoding: "utf8"
    });
    
    configWatch.on("change", async eventType => {
        worker.logger.info("Config file updated, reloading..");
        try {
            const defaultConfig = createDefaultConfig();
            const updatedConfig = JSON.parse(await fs.promises.readFile(configFile, "utf8"));
            recursiveAssign(defaultConfig, updatedConfig || {});

            worker.updateConfig(defaultConfig);
        } catch (e) {
            if (e.code) {
                worker.logger.warn("Cannot open config file (" + e.code + "); not reloading config.");
            }
        }
    });
})();