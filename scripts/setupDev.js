const fs = require("fs/promises");
const path = require("path");
const child_process = require("child_process");

function runCommandInDir(dir, command) {
    return new Promise((resolve, reject) => {
        child_process.exec(command, {
            cwd: dir
        }, (err, stdout) => {
            if (err) {
                reject(err);
                return;
            }
            resolve(stdout);
        });
    });
}

const baseSkeldjsDirectory = path.resolve(__dirname, "..", "..", "SkeldJS");

async function checkSkeldJsCloned() {
    try {
        await fs.stat(baseSkeldjsDirectory);
        return true;
    } catch (e) {
        if (e.code === "ENOENT") {
            return false;
        }

        throw e;
    }
}

async function readPackageJson() {
    return JSON.parse(await fs.readFile(path.resolve(__dirname, "..", "package.json"), "utf8"));
}

async function linkSkeldJs() {
    const packageJson = await readPackageJson();
    const skeldjsPackages = Object.keys(packageJson.dependencies)
        .filter(dependency => dependency.startsWith("@skeldjs/"))
        .map(dependency => dependency.split("/")[1]);

    for (const skeldjsPackage of skeldjsPackages) {
        const localInstallationDir = path.resolve(__dirname, "..", "node_modules", "@skeldjs", skeldjsPackage);
        await fs.rm(localInstallationDir, { recursive: true });
        await fs.symlink(path.resolve(baseSkeldjsDirectory, "packages", skeldjsPackage), localInstallationDir, "dir");
    }
}

async function buildSkeldJs() {
    await runCommandInDir(baseSkeldjsDirectory, "yarn build-all");
}

(async () => {
    console.log("Checking for local SkeldJS installation..");
    if (await checkSkeldJsCloned()) {
        console.log("Linking SkeldJS..");
        await linkSkeldJs();
        console.log("Building SkeldJS..");
        await buildSkeldJs();
        console.log("Built SkeldJS!");
    } else {
        console.log("SkeldJS not installed locally; clone SkeldJS into the same parent folder as Hindenburg to setup a dev environment");
    }
})();
