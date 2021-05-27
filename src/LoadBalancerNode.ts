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

import { ExtractEventTypes } from "@skeldjs/events";

import { MatchmakerNodeEvents, MatchmakerNode } from "./MatchmakerNode";
import { HindenburgConfig, HindenburgLoadBalancerClusterConfig } from "./Node";
import { Client } from "./Client";

import { formatSeconds } from "./util/format-seconds";
import { LoadBalancerBeforeCreateEvent, LoadBalancerBeforeJoinEvent } from "./events";
import { fmtClient } from "./util/format-client";

export type LoadBalancerNodeEvents = ExtractEventTypes<[
    LoadBalancerBeforeCreateEvent,
    LoadBalancerBeforeJoinEvent
]>;

export class LoadBalancerNode extends MatchmakerNode<LoadBalancerNodeEvents & MatchmakerNodeEvents> {
    constructor(config: Partial<HindenburgConfig>, pluginDirectory: string) {
        super(":" + config.loadbalancer?.port, config, pluginDirectory);

        this.redis.flushdb();

        this.decoder.on(HostGameMessage, async (message, direction, client) => {
            if (!this.checkClientMods(client))
                return;

            const [ cluster, nodePort ] = this.selectRandomNode();

            const ev = await this.emit(
                new LoadBalancerBeforeCreateEvent(
                    client,
                    message.options,
                    cluster.ip,
                    nodePort
                )
            );

            if (!ev.canceled) {
                await this.redirectClient(client, ev.redirectIp, ev.redirectPort);
            }
        });

        this.decoder.on(JoinGameMessage, async(message, direction, client) => {
            if (!this.checkClientMods(client))
                return;

            const name = Int2Code(message.code);
            const address = await this.redis.get("room." + name);
            
            const parts = address ? address.split(":") : [];

            const ev = await this.emit(
                new LoadBalancerBeforeJoinEvent(
                    client,
                    message.code,
                    parts[0],
                    parts[1] ? parseInt(parts[1]) : undefined
                )
            );

            if (!ev.canceled) {
                if (!ev.redirectIp || !ev.redirectPort)
                    return client.joinError(DisconnectReason.GameNotFound);

                await this.redirectClient(client, ev.redirectIp, ev.redirectPort);
            }
        });
    }

    get listeningIp() {
        return this.config.loadbalancer.ip;
    }

    isLoadBalancer(): this is LoadBalancerNode {
        return true;
    }

    beginListen() {
        return new Promise<void>(resolve => {
            this.socket.bind(this.config.loadbalancer.port);
    
            this.socket.on("listening", () => {
                this.logger.info("Listening on *:%s", this.config.loadbalancer.port);
                resolve();
            });
            
            this.socket.on("message", this.onMessage.bind(this));
        });
    }

    async handleInitialMessage(parsed: Serializable, client: Client) {
        const banned = await this.redis.get("ban." + client.remote.address);
        if (banned) {
            const banned_time = new Date(banned).getTime();
            const seconds = (banned_time - Date.now()) / 1000;

            client.disconnect(
                this.config.anticheat.banMessage
                    .replace("%s", formatSeconds(~~seconds))
            );
            return;
        }

        const num_connections = await this.redis.scard("connections." + client.remote.address);
        
        if (num_connections && this.config.anticheat.maxConnectionsPerIp > 0) {
            if (num_connections >= this.config.anticheat.maxConnectionsPerIp) {
                client.disconnect(
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

    selectRandomNode(): [ HindenburgLoadBalancerClusterConfig, number ] {
        const cluster = this.config.loadbalancer.clusters[Math.floor(Math.random() * this.config.loadbalancer.clusters.length)];
        const nodePort = cluster.ports[Math.floor(Math.random() * cluster.ports.length)];

        return [ cluster, nodePort ];
    }

    async redirectClient(client: Client, nodeIp: string, nodePort: number) {
        const redirected = await this.redis.hgetall("redirected." + client.remote.address + "." + client.username);

        if (redirected) {
            const delete_at = new Date(redirected.date).getTime() + (parseInt(redirected.num) * 6000);
            if (Date.now() < delete_at) {
                const ms = delete_at - Date.now();
                this.logger.info(
                    "Client from %s still connecting to node, waiting %sms for %s to be redirected.",
                    client.remote.address, ms, fmtClient(client)
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
                        nodeIp,
                        nodePort
                    )
                ]
            )
        );
        
        this.logger.info(
            "Redirected %s to node at %s:%s.",
            fmtClient(client), nodeIp, nodePort
        );
    }
}