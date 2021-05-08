import path from "path";
import fs from "fs/promises";

import { HindenburgServer } from "../src";

(async () => {
    if (!process.env.PORT || !process.env.NODE_ID)
        throw new Error("Please launch this script through the cluster script.");

    const config = JSON.parse(await fs.readFile(path.resolve(process.cwd(), "./config.json"), "utf8"));

    const server = new HindenburgServer({
        ...config,
        node: {
            ip: config.cluster.ip,
            port: parseInt(process.env.PORT)
        }
    });

    await server.listen();

    process.send?.("ready");

    process.on("SIGINT", async () => {
        await server.graceful();

        process.exit();
    });
})();