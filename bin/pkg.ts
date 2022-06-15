import path from "path";

process.env.IS_PKG = "1";
process.env.PKG_EXE_DIRNAME = path.dirname(process.argv[0]);

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
    default:
        process.argv.splice(0, 3, "yarn", "start");
        await import("./worker");
        break;
    }
})();
