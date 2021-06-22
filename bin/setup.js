const path = require("path");
const fs = require("fs");

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
        "hbplugin-ban-textfile": "next"
    }
}`

const default_config = `{
    "plugins": {}
}`;

const plugins_dir = process.env.HINDENBURG_PLUGINS || path.join(process.cwd(), "./plugins");
const config_file = process.env.HINDENBURG_CONFIG || path.join(process.cwd(), "./config.json");

if (!doesExist(plugins_dir)) {
    console.log("No plugins directory, creating folder, yarn.lock and package.json.");
    fs.mkdirSync(plugins_dir);
    fs.writeFileSync(path.join(plugins_dir, "yarn.lock"), "", "utf8");
    fs.writeFileSync(path.join(plugins_dir, "package.json"), default_package_json);
    console.log("Created plugins/ at " + plugins_dir);
} else {
    if (!doesExist(path.join(plugins_dir, "yarn.lock"))) {
        console.log("No yarn.lock for plugins, creating one.");
        fs.writeFileSync(path.join(plugins_dir, "yarn.lock"), "", "utf8");
    }
    if (!doesExist(path.join(plugins_dir, "package.json"))) {
        console.log("No package.json for plugins, creating one.");
        fs.writeFileSync(path.join(plugins_dir, "package.json"), default_package_json, "utf8");
    }
}
// todo: run yarn install in plugins directory

if (!doesExist(config_file)) {
    console.log("No config.json, creating one.");
    fs.writeFileSync(config_file, default_config, "utf8");
    console.log("Created config.json at " + config_file);
}

console.log("Setup complete!");