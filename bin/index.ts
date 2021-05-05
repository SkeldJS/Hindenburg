import path from "path";
import fs from "fs";

import { HindenburgServer, HindenburgServerConfig } from "../src";

function read_config(): HindenburgServerConfig {
    const pathname = path.resolve(process.cwd(), "./config.json");

    try {
        const data = fs.readFileSync(pathname, "utf8");
        const config = JSON.parse(data);

        return config;
    } catch (e) {
        throw new Error("Invalid config file.");
    }
}

const config = read_config();
const server = new HindenburgServer(config);

server.listen();