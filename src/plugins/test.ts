import { DisconnectReason } from "@skeldjs/constant";
import { GameOptions } from "@skeldjs/protocol";
import { Int2Code } from "@skeldjs/util";

import {
    LoadBalancerBeforeCreateEvent,
    LoadBalancerBeforeJoinEvent,
    WorkerBeforeJoinEvent
} from "../events";

import { LoadBalancerNode } from "../LoadBalancerNode";
import { WorkerNode } from "../WorkerNode";
import { DeclarePlugin } from "./hooks/DeclarePlugin";
import { Listener } from "./hooks/Listener";
import { PluginInfo } from "./Plugin";

@DeclarePlugin({
    id: "hb.customgamecode.plugin",
    version: "1.0.0",
    description: "Allows players to assign their own game code to their games.",
    defaultConfig: {},
    clientSide: false,
    loadBalancer: true
})
export default class CustomGameCodePlugin {
    meta!: PluginInfo;
    server!: LoadBalancerNode|WorkerNode;
    
    onPluginLoad() {

    }

    onPluginUnload() {

    }

    @Listener("loadbalancer.beforecreate")
    async loadBalancerBeforeCreate(ev: LoadBalancerBeforeCreateEvent) {
        ev.cancel();
        const redisKey = `customgamecode.${ev.client.remote.address}.${ev.client.version}.${ev.client.username}`;
        await this.server.redis.set(redisKey, JSON.stringify(ev.gameOptions));
        await this.server.redis.expire(redisKey, 60);
        ev.client.joinError(DisconnectReason.Custom, "Enter custom game code in the join game section, or enter CANCEL to stop.");
    }

    @Listener("loadbalancer.beforejoin")
    async loadBalancerBeforeJoin(ev: LoadBalancerBeforeJoinEvent) {
        if (!this.server.isLoadBalancer())
            return;

        const redisKey = `customgamecode.${ev.client.remote.address}.${ev.client.version}.${ev.client.username}`;
        const pendingCreateGameOptions = await this.server.redis.get(redisKey);

        if (pendingCreateGameOptions) {
            const [ cluster, nodePort ] = this.server.selectRandomNode();

            ev.cancel();
            await this.server.redirectClient(ev.client, cluster.ip, nodePort);
        }
    }

    @Listener("worker.beforejoin")
    async workerBeforeJoin(ev: WorkerBeforeJoinEvent) {
        if (this.server.isLoadBalancer())
            return;

        const redisKey = `customgamecode.${ev.client.remote.address}.${ev.client.version}.${ev.client.username}`;
        const pendingCreateGameOptions = await this.server.redis.get(redisKey);

        if (!pendingCreateGameOptions)
            return;

        if (ev.foundRoom) {
            ev.cancel();
            ev.client.joinError(DisconnectReason.Custom, "A room with that code already exists, please select another or enter CANCEL to stop.");
            return;
        }
        
        await this.server.redis.del(redisKey);

        if (Int2Code(ev.gameCode) === "CANCEL") {
            ev.cancel();
            ev.client.joinError(DisconnectReason.None);
            return;
        }

        const parsedGameOptions = JSON.parse(pendingCreateGameOptions);
        const gameOptions = new GameOptions(parsedGameOptions);

        const createdRoom = await this.server.createRoom(ev.gameCode, gameOptions);
        ev.setRoom(createdRoom);
    }
}