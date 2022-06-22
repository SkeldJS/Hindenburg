#!/usr/bin/env node
import chalk from "chalk";
import path from "path";

process.env.IS_PKG = "1";
process.env.PKG_EXE_DIRNAME = path.dirname(process.argv[0]);
process.env.PKG_EXE_BASENAME = path.basename(process.argv[0]);

(async () => {
    switch (process.argv[2]) {
    case "setup":
        process.argv.splice(0, 3, "yarn", "setup");
        await import("./setup");
        break;
    case "plugins":
        process.argv.splice(0, 3, "yarn", "plugins");
        await import("./plugins");
        break;
    case "help":
        console.log("Usage: " + process.env.PKG_EXE_BASENAME + " [action]");
        console.log("       " + process.env.PKG_EXE_BASENAME + " setup   " + chalk.gray("# setup hindenburg initially"));
        console.log("       " + process.env.PKG_EXE_BASENAME + " plugins " + chalk.gray("# run commands related to managing plugins for hindenburg"));
        console.log("       " + process.env.PKG_EXE_BASENAME + "         " + chalk.gray("# start a Hindenburg instance"));
        break;
    default:
        process.argv.splice(0, 3, "yarn", "start");
        await import("./worker");
        break;
    }
})();
