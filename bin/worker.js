require("./modulePatch");
const path = require("path");
const { Worker } = require("../src/Worker");

(async () => {
    const worker = new Worker("TEST", 0, {}, path.resolve(process.cwd(), "plugins"));
    await worker.listen();
    await worker.pluginHandler.loadFromDirectory();
    worker.logger.info("Listening on *:22023");
})();