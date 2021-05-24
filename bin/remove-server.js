const path = require("path");
const fs = require("fs");

const regionInfoPath = path.resolve(process.env.APPDATA, "..\\LocalLow\\Innersloth\\Among Us\\regionInfo.json");

const args = process.argv.slice(2);

if (!args.length) {
    console.log("Usage: remove-server <region name> [<region name>]...")
    return;
}

const regions = JSON.parse(fs.readFileSync(regionInfoPath));

for (let i = 0; i < args.length;) {
    const name = args[i++];

    regions.Regions.splice(
        regions.Regions.findIndex(region =>
            region.name === name)
    );
}

fs.writeFileSync(regionInfoPath, JSON.stringify(regions), "utf8");

