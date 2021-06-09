const { Worker } = require("../src/Worker");

(async () => {
    const worker = new Worker("TEST", 0, {});
    await worker.listen();
    console.log("Listening on *:22023");
})();