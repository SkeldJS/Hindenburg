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

const default_config = `{
    "plugins": {}
}`;

const plugins_dir = process.env.HINDENBURG_PLUGINS || path.join(process.cwd(), "./plugins");
const config_file = process.env.HINDENBURG_CONFIG || path.join(process.cwd(), "./config.json");

if (!doesExist(plugins_dir)) {
    console.log("No plugins directory, creating folder, yarn.lock and package.json.");
    fs.mkdirSync(plugins_dir);
    fs.writeFileSync(path.join(plugins_dir, "yarn.lock"), "", "utf8");
    fs.writeFileSync(path.join(plugins_dir, "package.json"), `{
    "dependencies": {}
}`);
} else {
    if (!doesExist(path.join(plugins_dir, "yarn.lock"))) {
        console.log("No yarn.lock for plugins, creating one.");
        fs.writeFileSync(path.join(plugins_dir, "yarn.lock"), "", "utf8");
    }
    if (!doesExist(path.join(plugins_dir, "package.json"))) {
        console.log("No package.json for plugins, creating one.");
        fs.writeFileSync(path.join(plugins_dir, "package.json"), "", "utf8");
    }
}

if (!doesExist(config_file)) {
    console.log("No config.json, creating one.");
    fs.writeFileSync(config_file, default_config, "utf8");
}

console.log("Setup complete!");