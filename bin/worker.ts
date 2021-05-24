import path from "path";
import fs from "fs/promises";

import { WorkerNode } from "../src";
import { MessageOpcode } from "./MessageOpcode";
import { sleep } from "@skeldjs/util";

(async () => {
    if (!process.env.NODE_ID || !process.env.CLUSTER_NAME)
        throw new Error("Please launch this script through the cluster script.");

    const data = await fs.readFile(path.resolve(process.cwd(), "./config.json"), "utf8");
    const config = JSON.parse(data);

    const server = new WorkerNode(config, parseInt(process.env.NODE_ID));

    await server.listen();
    await server.loadPlugins();

    process.send?.(MessageOpcode.Ready);

    process.on("message", async (message: string) => {
        if (message === MessageOpcode.Shutdown) {
            await server.gracefulShutdown();
            await sleep(200);
            process.send?.(MessageOpcode.ShutdownDone);
        }
    });
})();