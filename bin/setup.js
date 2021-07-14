const path = require("path");
const fs = require("fs/promises");
const { runCommandInDir, createSpinner, stopSpinner, createDefaultConfig } = require("./util");

module.exports = { createDefault: createDefaultConfig };

async function doesExist(path) {
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

const pluginsDirectory = process.env.HINDENBURG_PLUGINS || path.join(process.cwd(), "./plugins");
const configFile = process.env.HINDENBURG_CONFIG || path.join(process.cwd(), "./config.json");

(async () => {
    const yarnLockFile = path.join(pluginsDirectory, "yarn.lock");

    const packageJsonFile = path.join(pluginsDirectory, "package.json");
    const pluginsSpinner = createSpinner("Creating plugins directory..");
    if (!await doesExist(pluginsDirectory)) {
        try {
            await fs.mkdir(pluginsDirectory);
            await fs.writeFile(yarnLockFile, "", "utf8");
            await fs.writeFile(packageJsonFile, JSON.stringify(defaultPackageJson, undefined, 4), "utf8");
        } catch (e) {
            stopSpinner(pluginsSpinner, false);
            console.log("Failed to create plugins directory:");
            console.error(e);
            return;
        }
    }
    
    if (!await doesExist(yarnLockFile)) {
        try {
            await fs.writeFile(yarnLockFile, "", "utf8");
        } catch (e) {
            stopSpinner(pluginsSpinner, false);
            console.log("Failed to create plugins directory:");
            console.error(e);
            return;
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
            stopSpinner(pluginsSpinner, false);
            console.log("Failed to create plugins directory:");
            console.error(e);
            return;
        }
    }
    stopSpinner(pluginsSpinner, true);

    const installingSpinner = createSpinner("Installing plugins..");
    try {
        await runCommandInDir(pluginsDirectory, "yarn install");
        stopSpinner(installingSpinner, true);
    } catch (e) {
        stopSpinner(installingSpinner, false);
    }

    let flag = false;
    if (await doesExist(configFile)) {
        const verifySpinner = createSpinner("Verifying config.json..");
        let configJsonData;
        try {
            configJsonData = await fs.readFile(configFile, "utf8");
        } catch (e) {
            stopSpinner(verifySpinner);
            console.error("Failed to read config.json:", e.code);
        }

        try {
            JSON.parse(configJsonData);
            stopSpinner(verifySpinner, true);
        } catch (e) {
            stopSpinner(verifySpinner, false);
            flag = true;
        }
    } else {
        flag = true;
    }
    
    if (flag) {
        const configSpinner = createSpinner("Creating config.json..");
        try {
            const defaultConfig = createDefaultConfig();
            await fs.writeFile(
                configFile,
                JSON.stringify(defaultConfig, undefined, 4),
                "utf8"
            );
            stopSpinner(configSpinner, true);
        } catch (e) {
            stopSpinner(configSpinner, false);
            console.error("Failed to create config.json:", e.code);
        }
    }

    console.log("Setup complete!");
})();