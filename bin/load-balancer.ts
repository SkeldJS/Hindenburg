
import "./modulePatch";

import path from "path";
import fs from "fs/promises";
import chalk from "chalk";

import { LoadBalancerNode } from "../src";
import { getExternalIp } from "./util/getExternalIp";
import { getInternalIp } from "./util/getInternalIp";
import { makeConfig } from "./util/makeConfig";


(async () => {
    const configFilename = process.env.HINDENBURG_CONFIG || path.resolve(process.cwd(), "config.json");
    const pluginsDirectory = process.env.HINDENBURG_PLUGINS || path.resolve(process.cwd(), "./plugins");

    const config = JSON.parse(await fs.readFile(configFilename, "utf8"));

    const externalIp = await getExternalIp();
    const internalIp = await getInternalIp();

    const server = new LoadBalancerNode(makeConfig(config, externalIp), path.resolve(__dirname, pluginsDirectory));
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
})();