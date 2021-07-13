require("./modulePatch");
const path = require("path");
const fs = require("fs");
const https = require("https");
const compareVersions = require("compare-versions");
const chokidar = require("chokidar");

const { createSpinner, stopSpinner, createDefault } = require("./util");
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
        const req = https.get("https://cdn.jsdelivr.net/gh/SkeldJS/Hindenburg/package.json", res => {
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
    const defaultConfig = createDefault();
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
                console.log(chalk.yellow("New version of Hindenburg available: " + latestVersion + ", use 'git pull && yarn build' to update"));
            } else {
                console.log("Up to date!");
            }
        } catch (e) {
            stopSpinner(versionSpinner, false);
            console.error("Failed to check for updates, nevermind.");
        }
    }

    if (!resolvedConfig) {
        worker.logger.warn("Cannot open config file; using default config.");
    }

    await worker.listen(worker.config.socket.port);
    await worker.pluginHandler.loadFromDirectory();

    const configWatch = chokidar.watch(configFile, {
        persistent: false,
        encoding: "utf8"
    });
    
    configWatch.on("change", async eventType => {
        worker.logger.info("Config file updated, reloading..");
        try {
            const defaultConfig = createDefault();
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