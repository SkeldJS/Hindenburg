import path from "path";
import fs from "fs/promises";

import { HindenburgLoadBalancer } from "../src";


(async () => {
    const config_path = path.resolve(process.cwd(), "./config.json");

    try {
        const config = JSON.parse(await fs.readFile(config_path, "utf8"));

        const server = new HindenburgLoadBalancer(config);

        server.listen();
    } catch (e) {
        if (e.code === "ENOENT") {
            console.log("No config file detected, writing default config..");
    
            const config = `{
"$schema": "./misc/config.schema.json",
"reactor": false,
"versions": ["2021.4.2"],
"anticheat": {
    "checkSettings": true,
    "maxConnectionsPerIp": 0,
    "checkObjectOwnership": true,
    "hostChecks": true,
    "malformedPackets": false,
    "invalidFlow": false,
    "invalidName": true,
    "massivePackets": {
        "penalty": "disconnect",
        "strikes": 3
    }
},
"cluster": {
    "name": "Capybara",
    "ip": "127.0.0.1",
    "ports": [
        22123
    ]
},
"loadbalancer": {
    "clusters": [
        {
            "name": "Capybara",
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