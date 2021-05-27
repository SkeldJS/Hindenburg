import { DisconnectReason } from "@skeldjs/constant";
import { GameOptions } from "@skeldjs/protocol";
import { Int2Code } from "@skeldjs/util";

import {
    LoadBalancerBeforeCreateEvent,
    LoadBalancerBeforeJoinEvent,
    WorkerBeforeJoinEvent
} from "../../src/events";

import { LoadBalancerNode } from "../../src/LoadBalancerNode";
import { WorkerNode } from "../../src/WorkerNode";
import { DeclarePlugin } from "../../src/plugins/hooks/DeclarePlugin";
import { OnEvent } from "../../src/plugins/hooks/OnEvent";

@DeclarePlugin({
    id: "hb.customgamecode.plugin",
    version: "1.0.0",
    description: "Allows players to assign their own game code to their games.",
    defaultConfig: {},
    clientSide: false,
    loadBalancer: true
})
export default class CustomGameCodePlugin {
    constructor(public readonly server: LoadBalancerNode|WorkerNode, public readonly config: any) {};

    @OnEvent("loadbalancer.beforecreate")
    async loadBalancerBeforeCreate(ev: LoadBalancerBeforeCreateEvent) {
        ev.cancel();
        const redisKey = `customgamecode.${ev.client.remote.address}.${ev.client.version}.${ev.client.username}`;
        await this.server.redis.set(redisKey, JSON.stringify(ev.gameOptions)); // Mark this client as creating a game.
        await this.server.redis.expire(redisKey, 60); // Expire in 60 seconds if they haven't already created a game.
        ev.client.joinError("Enter custom game code in the join game section, or enter CANCEL to stop.");
    }

    @OnEvent("loadbalancer.beforejoin")
    async loadBalancerBeforeJoin(ev: LoadBalancerBeforeJoinEvent) {
        // Normally the load balancer would 
        if (!this.server.isLoadBalancer())
            return;

        const redisKey = `customgamecode.${ev.client.remote.address}.${ev.client.version}.${ev.client.username}`;
        const pendingCreateGameOptions = await this.server.redis.get(redisKey);

        if (pendingCreateGameOptions) { // Only if they're trying to create a game.
            if (ev.redirectIp) { // A room already exists with the code that the client selected.
                ev.cancel();
                ev.client.joinError("A room with that code already exists, please select another or enter CANCEL to stop.");
                return;
            }

            if (Int2Code(ev.gameCode) === "CANCEL") { // Exit if the client is canceling creating a game.
                await this.server.redis.del(redisKey);
                ev.cancel();
                ev.client.disconnect(DisconnectReason.None);
                return;
            }

            const [ cluster, nodePort ] = this.server.selectRandomNode(); // Pick a random node & redirect (like done when hosting a game).

            ev.cancel();
            await this.server.redirectClient(ev.client, cluster.ip, nodePort);
        }
    }

    @OnEvent("worker.beforejoin")
    async workerBeforeJoin(ev: WorkerBeforeJoinEvent) {
        if (this.server.isLoadBalancer())
            return;

        const redisKey = `customgamecode.${ev.client.remote.address}.${ev.client.version}.${ev.client.username}`;
        const pendingCreateGameOptions = await this.server.redis.get(redisKey);

        if (!pendingCreateGameOptions)
            return;
            
        await this.server.redis.del(redisKey);
        
        const parsedGameOptions = JSON.parse(pendingCreateGameOptions);
        const gameOptions = new GameOptions(parsedGameOptions);

        const createdRoom = await this.server.createRoom(ev.gameCode, gameOptions);
        ev.setRoom(createdRoom);
    }
}