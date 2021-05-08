import path from "path";
import fs from "fs/promises";

import { HindenburgConfig, HindenburgLoadBalancer } from "../src";


(async () => {
    const config_path = path.resolve(process.cwd(), "./config.json");

    try {
        const config = JSON.parse(await fs.readFile(config_path, "utf8"));

        const nodes = [];

        for (const cluster of config.master.clusters) {
            nodes.push(...cluster.ports.map((port: number) => {
                return {
                    ip: cluster.ip,
                    port
                }
            }));
        }

        const server = new HindenburgLoadBalancer({
            ...config,
            node: {
                ip: config.master.ip,
                port: config.master.port
            },
            master: {
                ip: config.master.ip,
                port: config.master.port,
                nodes
            }
        });

        server.listen();
    } catch (e) {
        if (e.code === "ENOENT") {
            console.log("No config file detected, writing default config..");
    
            const config = `{
        "$schema": "./misc/config.schema.json",
        "serverName": "Hindenburg",
        "serverVersion": "1.0.0",
        "reactor": false,
        "anticheat": {
            "checkSettings": true,
            "maxConnectionsPerIp": 2,
            "checkObjectOwnership": true,
            "hostChecks": true,
            "malformedPackets": true,
            "massivePackets": {
                "penalty": "disconnect",
                "strikes": 3
            },
            "versions": ["2021.4.2"]
        },
        "clusters": {
            "ip": "127.0.0.1",
            "ports": [
                22123
            ]
        },
        "master": {
            "clusters": [
                {
                    "ip": "127.0.0.1",
                    "ports": [
                        22123
                    ]
                }
            ],
            "ip": "127.0.0.1",
            "port": 22023
        },
        "redis": {
            "host": "127.0.0.1",
            "port": 6379
        }
    }`;
    
            await fs.writeFile(config_path, config, "utf8");
            
            console.log("Wrote default config file, please restart the program to continue.");
        } else {
            throw e;
        }
    }
})();