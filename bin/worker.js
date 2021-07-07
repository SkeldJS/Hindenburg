require("./modulePatch");
const path = require("path");
const fs = require("fs");
const chokidar = require("chokidar");
const { Worker } = require("../src/Worker");
const { recursiveAssign } = require("../src/util/recursiveAssign");

const defaultConfig = {
    clusterName: "Capybara",
    nodeId: 0,
    socket: {
        port: 22023
    },
    plugins: {},
    anticheat: {
        penalty: {
            action: "disconnect",
            strikes: 2,
            banAfterXDisconnects: 3,
            banDuration: 3600,
            disconnectMessage: "You have been banned for $duration."
        },
        rules: {}
    },
    logging: {}
}

const configFile = process.env.HINDENBURG_CONFIG || path.join(process.cwd(), "./config.json");
async function resolveConfig() {
    try {
        return JSON.parse(await fs.promises.readFile(configFile, "utf8"));
    } catch (e) {
        return false;
    }
}

(async () => {
    const resolvedConfig = await resolveConfig();
    recursiveAssign(defaultConfig, resolvedConfig || {});

    const worker = new Worker("TEST", 0, defaultConfig, path.resolve(process.cwd(), "plugins"));

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
            const updatedConfig = JSON.parse(await fs.promises.readFile(configFile, "utf8"));

            worker.updateConfig(updatedConfig);
        } catch (e) {
            if (e.code) {
                worker.logger.warn("Cannot open config file (" + e.code + "); not reloading config.");
            }
        }
    });
})();