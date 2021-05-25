import { DisconnectReason } from "@skeldjs/constant";
import { GameOptions } from "@skeldjs/protocol";
import { Int2Code } from "@skeldjs/util";
import { LoadBalancerNode, WorkerNode } from "../../src";

export function getPluginInfo() {
    return {
        name: "CustomGameCode",
        description: "Allow clients to select their own game codes when creating a room.",
        loadBalancer: true
    }
}

export function loadPlugin(server: LoadBalancerNode|WorkerNode, config: any) {
    if (server.isLoadBalancer()) {
        server.on("loadbalancer.beforecreate", async ev => {
            ev.cancel();
            const redisKey = `customgamecode.${ev.client.remote.address}.${ev.client.version}.${ev.client.username}`;
            await server.redis.set(redisKey, JSON.stringify(ev.gameOptions));
            await server.redis.expire(redisKey, 60);
            ev.client.joinError(DisconnectReason.Custom, "Enter custom game code in the join game section, or enter CANCEL to stop.");
        });
    
        server.on("loadbalancer.beforejoin", async ev => {
            const redisKey = `customgamecode.${ev.client.remote.address}.${ev.client.version}.${ev.client.username}`;
            const pendingCreateGameOptions = await server.redis.get(redisKey);

            if (pendingCreateGameOptions) {
                const [ cluster, nodePort ] = server.selectRandomNode();
    
                ev.cancel();
                await server.redirectClient(ev.client, cluster.ip, nodePort);
            }
        });
    } else {
        server.on("worker.beforejoin", async ev => {
            const redisKey = `customgamecode.${ev.client.remote.address}.${ev.client.version}.${ev.client.username}`;
            const pendingCreateGameOptions = await server.redis.get(redisKey);
    
            if (!pendingCreateGameOptions)
                return;
    
            if (ev.foundRoom) {
                ev.cancel();
                ev.client.joinError(DisconnectReason.Custom, "A room with that code already exists, please select another or enter CANCEL to stop.");
                return;
            }
            
            await server.redis.del(redisKey);
    
            if (Int2Code(ev.gameCode) === "CANCEL") {
                ev.cancel();
                ev.client.joinError(DisconnectReason.None);
                return;
            }
    
            const parsedGameOptions = JSON.parse(pendingCreateGameOptions);
            const gameOptions = new GameOptions(parsedGameOptions);
    
            const createdRoom = await server.createRoom(ev.gameCode, gameOptions);
            ev.setRoom(createdRoom);
        });
    }
}