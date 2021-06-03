const child_process = require("child_process");
const path = require("path");

(async () => {
    if (!process.argv[2]) {
        console.log("Usage: add-plugin <pluginid>");
        return;
    }

    const pluginsDirectory = process.env.HINDENBURG_PLUGINS || path.resolve(process.cwd(), "./plugins");

    const packageName = process.argv[2].startsWith("hbplugin-")
        ? process.argv[2]
        : "hbplugin-" + process.argv[2];

    child_process.exec("yarn add \"" + packageName + "\"" ,{
        cwd: pluginsDirectory
    }, (err, stdout, stdin) => {
        if (err) {
            console.log("An error occurred while installing plugin:");
            console.error(err);
            return;
        }
        console.log("Succesfully installed plugin!");
    });
})();