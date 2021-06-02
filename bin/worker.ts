import path from "path";
import fs from "fs/promises";
import { sleep } from "@skeldjs/util";

import { WorkerNode } from "../src";
import { MessageOpcode } from "./MessageOpcode";
import { getExternalIp } from "./util/getExternalIp";
import { makeConfig } from "./util/makeConfig";

(async () => {
    if (!process.env.NODE_ID || !process.env.CLUSTER_NAME)
        throw new Error("Please launch this script through the cluster script.");

    const data = await fs.readFile(path.resolve(process.cwd(), "./config.json"), "utf8");
    const externalIp = await getExternalIp();
    const config = JSON.parse(data);

    const server = new WorkerNode(makeConfig(config, externalIp), parseInt(process.env.NODE_ID), path.resolve(process.cwd(), "./plugins"));

    await server.beginListen();
    await server.pluginLoader.loadFromDirectory();

    process.send?.(MessageOpcode.Ready);

    process.on("message", async (message: string) => {
        if (message === MessageOpcode.Shutdown) {
            await server.beginGracefulShutdown();
            await sleep(200);
            process.send?.(MessageOpcode.ShutdownDone);
        }
    });
})();