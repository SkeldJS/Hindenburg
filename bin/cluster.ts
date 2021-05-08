import path from "path";
import fs from "fs/promises";

import { Cluster } from "../src/Cluster";


(async () => {
    const config = JSON.parse(await fs.readFile(path.resolve(process.cwd(), "./config.json"), "utf8"));

    const cluster = new Cluster;

    await cluster.start(config.cluster.ports);

    process.on("SIGINT", async () => {
        await cluster.gracefulShutdown();

        process.exit();
    });
})();