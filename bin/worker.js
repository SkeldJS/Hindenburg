require("./modulePatch");
const path = require("path");
const dgram = require("dgram");
const { Worker } = require("../src/Worker");

(async () => {
    if (process.argv.includes("--lan")) {
        const lanBroadcaster = dgram.createSocket("udp4");

        const message = "<size=150%><voffset=-1em>Hindenburg~Open~<color=#80cc06>Join Local</color>)<alpha=#00></voffset>\n~";

        lanBroadcaster.bind(() => {
            lanBroadcaster.setBroadcast(true);
        });
        setInterval(() => {
            const buf = Buffer.from([
                0x04,
                0x02,
                ...Buffer.from(message, "utf8")
            ]);
            lanBroadcaster.send(buf, 47777, "255.255.255.255"); // broadcast ip
        }, 50);
    }

    const worker = new Worker("TEST", 0, {}, path.resolve(process.cwd(), "plugins"));
    await worker.listen();
    await worker.pluginHandler.loadFromDirectory();
    worker.logger.info("Listening on *:22023");
})();