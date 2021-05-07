import path from "path";
import fs from "fs/promises";

import { HindenburgConfig, HindenburgLoadBalancer } from "../src";


(async () => {
    const config = JSON.parse(await fs.readFile(path.resolve(process.cwd(), "./config.json"), "utf8")) as HindenburgConfig;

    const server = new HindenburgLoadBalancer(config);

    server.listen();
})();