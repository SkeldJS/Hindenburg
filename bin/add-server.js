const path = require("path");
const fs = require("fs");

const regionInfoPath = path.resolve(process.env.APPDATA, "..\\LocalLow\\Innersloth\\Among Us\\regionInfo.json");

const args = process.argv.slice(2);

if (!args.length) {
    console.log("Usage: add-server reset\nOR\nUsage: set-server <region ip> <region port> <region name> [<region ip> <region port> <region name>]...")
    return;
}

if (args[0] === "reset") {
    const defaultRegions = {
        CurrentRegionIdx: 0,
        Regions: [{
                $type: "DnsRegionInfo, Assembly-CSharp",
                Fqdn: "na.mm.among.us",
                DefaultIp: "50.116.1.42",
                Port: 22023,
                Name: "North America",
                TranslateName: 289
            }, {
                $type: "DnsRegionInfo, Assembly-CSharp",
                Fqdn: "eu.mm.among.us",
                DefaultIp: "172.105.251.170",
                Port: 22023,
                Name: "Europe",
                TranslateName: 290
            }, {
                $type: "DnsRegionInfo, Assembly-CSharp",
                Fqdn: "as.mm.among.us",
                DefaultIp: "139.162.111.196",
                Port: 22023,
                Name: "Asia",
                TranslateName: 291
            }
        ]
    }

    fs.writeFileSync(regionInfoPath, JSON.stringify(defaultRegions), "utf8");

    return;
}

const regions = JSON.parse(fs.readFileSync(regionInfoPath));

for (let i = 0; i < args.length;) {
    const ip = args[i++];
    const port = parseInt(args[i++]);
    const name = args[i++];

    if (!ip) {
        throw new Error("Expected region IP.");
    }

    if (!port) {
        throw new Error("Expected region port.");
    }

    if (!name) {
        throw new Error("Expected region name.");
    }

    regions.Regions.push({
        $type: "DnsRegionInfo, Assembly-CSharp",
        Fqdn: ip,
        DefaultIp: ip,
        Port: port,
        Name: name,
        TranslateName: 1003
    });
}

fs.writeFileSync(regionInfoPath, JSON.stringify(regions), "utf8");

