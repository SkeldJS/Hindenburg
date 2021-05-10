import {
    HostGameMessage,
    JoinGameMessage,
    MessageDirection,
    RedirectMessage,
    ReliablePacket,
    Serializable
} from "@skeldjs/protocol";

import { DisconnectReason } from "@skeldjs/constant";
import { Int2Code, sleep } from "@skeldjs/util";

import { MatchmakingNode } from "./MatchmakingNode";
import { HindenburgConfig } from "./Node";
import { Client } from "./Client";

import { formatSeconds } from "./util/format-seconds";

export class HindenburgLoadBalancer extends MatchmakingNode {
    constructor(config: Partial<HindenburgConfig>) {
        super(":" + config.loadbalancer?.port, config);

        this.redis.flushdb();

        this.decoder.on(HostGameMessage, async (message, direction, client) => {
            if (!this.checkMods(client))
                return;
            
            const cluster = this.config.loadbalancer.clusters[~~(Math.random() * this.config.loadbalancer.clusters.length)];
            const port = cluster.ports[~~(Math.random() * cluster.ports.length)];

            const redirected = await this.redis.hgetall("redirected." + client.remote.address + "." + client.username);

            if (redirected) {
                const delete_at = new Date(redirected.date).getTime() + (parseInt(redirected.num) * 6000);
                if (Date.now() < delete_at) {
                    const ms = delete_at - Date.now();
                    this.logger.info(
                        "Client from %s still connecting to node, waiting %sms for client with ID %s to be redirected.",
                        client.remote.address, ms, client.clientid
                    );
                    await this.redis.hincrby("redirected." + client.remote.address + "." + client.username, "num", 1);
                    await sleep(ms);
                }
            }

            await this.redis.hmset("redirected." + client.remote.address + "." + client.username, {
                date: new Date().toString(),
                num: "1"
            });
            this.redis.expire("redirected." + client.remote.address + "." + client.username, 6);

            client.send(
                new ReliablePacket(
                    client.getNextNonce(),
                    [
                        new RedirectMessage(
                            cluster.ip,
                            port
                        )
                    ]
                )
            );

            this.logger.info(
                "Redirected client with ID %s to cluster %s at %s:%s.",
                client.clientid, cluster.name, cluster.ip, port
            );
        });

        this.decoder.on(JoinGameMessage, async(message, direction, client) => {
            if (!this.checkMods(client))
                return;

            const name = Int2Code(message.code);

            const address = await this.redis.get("room." + name);

            if (!address)
                return client.joinError(DisconnectReason.GameNotFound);

            const [ ip, port ] = address.split(":");

            client.send(
                new ReliablePacket(
                    client.getNextNonce(),
                    [
                        new RedirectMessage(
                            ip,
                            parseInt(port)
                        )
                    ]
                )
            );
            
            this.logger.info(
                "Redirected client with ID %s joining room %s to node at %s:%s.",
                client.clientid, name, ip, port
            );
        });
    }

    get ip() {
        return this.config.loadbalancer.ip;
    }

    listen() {
        return new Promise<void>(resolve => {
            this.socket.bind(this.config.loadbalancer.port);
    
            this.socket.on("listening", () => {
                this.logger.info("Listening on *:%s", this.config.loadbalancer.port);
                resolve();
            });
            
            this.socket.on("message", this.onMessage.bind(this));
        });
    }

    async handleInitial(parsed: Serializable, client: Client) {
        const banned = await this.redis.get("ban." + client.remote.address);
        if (banned) {
            const banned_time = new Date(banned).getTime();
            const seconds = (banned_time - Date.now()) / 1000;

            client.disconnect(
                DisconnectReason.Custom,
                this.config.anticheat.banMessage
                    .replace("%s", formatSeconds(~~seconds))
            );
            return;
        }

        const num_connections = await this.redis.get("connections." + client.remote.address);
        
        if (num_connections && this.config.anticheat.maxConnectionsPerIp > 0) {
            const connections = parseInt(num_connections);
            if (connections >= this.config.anticheat.maxConnectionsPerIp) {
                client.disconnect(
                    DisconnectReason.Custom,
                    "Too many connections coming from your IP."
                );
                return;
            }
        }

        try {
            await this.emitDecoded(parsed, MessageDirection.Serverbound, client);
        } catch (e) {
            this.logger.error("%s", e.stack);
        }
    }
}