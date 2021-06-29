import fs from "fs/promises";

import { DisconnectReason } from "@skeldjs/constant";

import {
    CliCommand,
    ClientBanEvent,
    ClientConnectEvent,
    EventListener,
    HindenburgPlugin,
    Plugin,
    Worker
} from "../../src";

interface IpBanInfo {
    reason: string;
    ip: string;
    username: string;
    bannedAt: number;
    duration: number;
}

@HindenburgPlugin({
    id: "hbplugin-ban-textfile",
    version: "1.0.0",
    order: "none"
})
export default class extends Plugin {
    bannedIps: Record<string, IpBanInfo>;

    constructor(
        public readonly worker: Worker,
        public readonly config: any
    ) {
        super(worker, config);

        this.bannedIps = {};
    }

    async onPluginLoad() {
        await this.readBanned();
    }

    async readBanned() {
        try {
            const data = await fs.readFile("./banned_ips.json", "utf8");
            this.bannedIps = JSON.parse(data);
        } catch (e) {
            if (e.code === "ENOENT") {
                await fs.writeFile("./banned_ips.json", "{\n\n}", "utf8");
                return;
            }
            throw e;
        }
    }
    
    async writeBanned() {
        await fs.writeFile("./banned_ips.json", JSON.stringify(this.bannedIps, undefined, 4), "utf8");
    }

    @CliCommand({
        usage: "unban <ip>"
    })
    async onUnbanClient(args: any) {
        delete this.bannedIps[args.ip];
        this.logger.info("Unbanned %s", args.ip);
        await this.writeBanned();
    }

    @EventListener("client.ban")
    async onClientBan(ev: ClientBanEvent) {
        this.bannedIps[ev.client.rinfo.address] = {
            reason: ev.reason,
            ip: ev.client.rinfo.address,
            username: ev.client.username,
            bannedAt: Date.now(),
            duration: ev.duration
        };
        this.logger.info("Banned %s for %s seconds", ev.client, ev.duration);
        await this.writeBanned();
    }

    @EventListener("client.connect")
    async onClientConnect(ev: ClientConnectEvent) {
        await this.readBanned();
        const bannedUntil = this.bannedIps[ev.client.rinfo.address];
        if (bannedUntil) {
            if (Date.now() < bannedUntil.bannedAt + (bannedUntil.duration * 1000)) {
                ev.client.disconnect(DisconnectReason.Banned);
            } else {
                delete this.bannedIps[ev.client.rinfo.address];
                await this.writeBanned();
            }
        }
    }
}