const path = require("path");
const fs = require("fs");
const child_process = require("child_process");

/**
 * @returns {HindenburgConfig}
 */
 function createDefault() {
    return {
        versions: ["2021.6.30"],
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
    };
}

module.exports = { createDefault };

function doesExist(path) {
    try {
        fs.statSync(path);
        return true;
    } catch (e) {
        return false;
    }
}

const default_package_json = `{
    "dependencies": {
        "hbplugin-ban-textfile": "*"
    }
}`

const plugins_dir = process.env.HINDENBURG_PLUGINS || path.join(process.cwd(), "./plugins");
const config_file = process.env.HINDENBURG_CONFIG || path.join(process.cwd(), "./config.json");

function installPlugins() {
    console.log("Installing plugins..");
    child_process.exec("yarn install" ,{
        cwd: plugins_dir
    }, (err, stdout, stdin) => {
        if (err) {
            console.log("An error occurred while installing plugin:");
            console.error(err);
            return;
        }
        console.log("Installed plugins!");
    });
}

if (!doesExist(plugins_dir)) {
    console.log("No plugins directory, creating folder, yarn.lock and package.json.");
    fs.mkdirSync(plugins_dir);
    fs.writeFileSync(path.join(plugins_dir, "yarn.lock"), "", "utf8");
    fs.writeFileSync(path.join(plugins_dir, "package.json"), default_package_json);
    console.log("Created plugins/ at " + plugins_dir);
    installPlugins();
} else {
    const yarnExist = doesExist(path.join(plugins_dir, "yarn.lock"));
    const packageJsonExist = doesExist(path.join(plugins_dir, "package.json"));
    if (!yarnExist) {
        console.log("No yarn.lock for plugins, creating one.");
        fs.writeFileSync(path.join(plugins_dir, "yarn.lock"), "", "utf8");
    }
    if (!packageJsonExist) {
        console.log("No package.json for plugins, creating one.");
        fs.writeFileSync(path.join(plugins_dir, "package.json"), default_package_json, "utf8");
    }
    if (!yarnExist || !packageJsonExist) {
        installPlugins();
    }
}

if (!doesExist(config_file)) {
    console.log("No config.json, creating one.");
    fs.writeFileSync(config_file, JSON.stringify(createDefault(), undefined, 4), "utf8");
    console.log("Created config.json at " + config_file);
}

console.log("Setup complete!");