import path from "path";
import fs from "fs/promises";
import chalk from "chalk";

import { LoadBalancerNode } from "../src";
import { getExternalIp } from "./util/getExternalIp";
import { getInternalIp } from "./util/getInternalIp";
import { makeConfig } from "./util/makeConfig";


(async () => {
    const config_path = path.resolve(process.cwd(), "./config.json");

    try {
        const config = JSON.parse(await fs.readFile(config_path, "utf8"));

        const externalIp = await getExternalIp();
        const internalIp = await getInternalIp();

        const server = new LoadBalancerNode(makeConfig(config, externalIp), path.resolve(__dirname, "../plugins"));
        console.log("\u001b[2J\u001b[0;0H");
        console.log(
            chalk.redBright(`
               #Q8g&&&&gQ#
              &qqqqqqqqqqqq0#
             gqqq5&Q##
            #qqqd   ${chalk.white("85ftcY]}cjW&#")}
            8qqqB  ${chalk.white("Nr~~~=      `!l")}
           #gqqqQ  ${chalk.white("Asv~~~=!:\",_,=;D")}
     ${chalk.red("#&RR")}  #gqqqR  ${chalk.white("gAAj}xxx]i}lyzb")}
     ${chalk.red("dddR  B")}8qqqqg  ${chalk.white("#DAAAAAAA5Rg#")}   ${chalk.bgBlue.white(`       Hindenburg       `)}
     ${chalk.red("QQQ#  QQN")}qqqqNQ   ${chalk.white("####")}         
    ${chalk.red("#QQQ#  QQ0qq")}qqqqqR&gggg&0RNq#   ${chalk.white("Listening on: ")}
    ${chalk.red("#QQQ#  BQ8Sqqqq")}qqqqqqqqqqqqqq#  ${chalk.grey("external: " + chalk.white(externalIp) + ":" + server.config.loadbalancer.port)}
    ${chalk.red("#QQQB  BQQ0qqqqqqq")}qqqqqqqqqR${chalk.red("#")}   ${chalk.grey("network:  " + chalk.white(internalIp) + ":" + server.config.loadbalancer.port)}
    ${chalk.red("#QQQB  BQQQDSqqqqqqqqqq")}qqS0${chalk.red("Q#")}   ${chalk.grey("local:    " + chalk.white("127.0.0.1") + ":" + server.config.loadbalancer.port)}
     ${chalk.red("QQQB  #QQQQ80dNSqqqqq5ND8")}Q${chalk.red("Q")}
     ${chalk.red("#QQQ  #QQQQQQQQQQQQQQQQQQQQ")}
      ${chalk.red("###  #QQQQQQQQBBB######QQ#")}
           ${chalk.red("#QQQQQQQ         BQQ")}
           ${chalk.red("#QQQQQQQ       QQQQQ")}
            ${chalk.red("QQQQQQB       QQQQ#")}
            ${chalk.red("##BB##")}`));

        await server.beginListen();
        await server.pluginLoader.loadFromDirectory();
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
    ],
    "plugins": {}
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