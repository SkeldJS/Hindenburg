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
        
    const configFilename = process.env.HINDENBURG_CONFIG || path.resolve(process.cwd(), "config.json");
    const pluginsDirectory = process.env.HINDENBURG_PLUGINS || path.resolve(process.cwd(), "./plugins");

    const config = JSON.parse(await fs.readFile(configFilename, "utf8"));

    const externalIp = await getExternalIp();

    const server = new WorkerNode(makeConfig(config, externalIp), parseInt(process.env.NODE_ID), pluginsDirectory);

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