import https from "https";

export function tryGetIp(service: string) {
    return new Promise<string>(resolve => {
        const req = https.request({
            hostname: service,
            port: 443,
            path: "/",
            method: "GET"
        }, res => {
            const allChunks: any[] = [];

            res.on("data", chunk => {
                allChunks.push(chunk);
            });

            res.on("end", () => {
                const concatChunks = Buffer.concat(allChunks);
                const result = concatChunks.toString("utf8");

                resolve(result.trim());
            });
        });

        req.end();
    });
}

export async function getExternalIp() {
    return await Promise.race([ tryGetIp("icanhazip.com"), tryGetIp("api.ipify.org") ])
}