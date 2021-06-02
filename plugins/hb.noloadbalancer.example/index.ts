import { GameMap, RootMessageTag } from "@skeldjs/constant";
import { Int2Code } from "@skeldjs/util";

import {
    LoadBalancerBeforeCreateEvent,
    LoadBalancerBeforeJoinEvent,
    WorkerBeforeCreateEvent
} from "../../src/events";

import { LoadBalancerNode } from "../../src/LoadBalancerNode";
import { WorkerNode } from "../../src/WorkerNode";
import { DeclarePlugin } from "../../src/plugins/hooks/DeclarePlugin";
import { OnEvent } from "../../src/plugins/hooks/OnEvent";
import {
    GameOptions,
    HostGameMessage, 
    JoinGameMessage,
    MessageDirection,
    ReliablePacket,
    UnreliablePacket
} from "@skeldjs/protocol";
import { fmtClient } from "../../src/util/format-client";
import { OnMessage } from "../../src/plugins/hooks/OnMessage";
import { Client } from "../../src/Client";

@DeclarePlugin({
    id: "hb.noloadbalancer.plugin",
    version: "1.0.0",
    description: "Allows hosting the loadbalancer and worker nodes in the same process and on the same port.",
    defaultConfig: {},
    clientSide: false,
    loadBalancer: true,
    order: "last"
})
export default class CustomGameCodePlugin {
    fakeWorker!: WorkerNode;

    constructor(public readonly server: LoadBalancerNode|WorkerNode, public readonly config: any) {
        if (server.isLoadBalancer()) {
            // Create a fake worker node that will be behind the load balancer.
            this.fakeWorker = new WorkerNode(server.config, 0, server.pluginLoader.pluginDirectory);
            this.fakeWorker.socket = this.server.socket; // (uses the same socket)
        }
    };

    async onPluginLoad() {
        if (this.fakeWorker) { 
            await this.fakeWorker.pluginLoader.loadFromDirectory();
        }
    }

    createFakeClient(client: Client) { // Clone the client for the fake worker.
        const fakeClient = new Client(
            this.fakeWorker,
            client.remote,
            this.fakeWorker.getNextClientID()   
        );
        this.fakeWorker.clients.set(
            client.address,
            fakeClient
        );
        fakeClient.identified = true;
        fakeClient.username = client.username;
        fakeClient.version = client.version;
        fakeClient.isUsingReactor = client.isUsingReactor;
        fakeClient.mods = client.mods ? [...client.mods] : undefined;
        (fakeClient as any)._incr_nonce = (client as any)._incr_nonce; // Typescript hax
        return fakeClient;
    }

    @OnEvent("loadbalancer.beforecreate")
    async loadBalancerBeforeCreate(ev: LoadBalancerBeforeCreateEvent) {
        ev.cancel();

        // Worker node logic
        if (this.fakeWorker.config.anticheat.checkSettings && !GameOptions.isValid(ev.gameOptions)) {
            this.fakeWorker.logger.warn("%s created room with invalid settings.", fmtClient(ev.client));

            if (await ev.client.penalize("checkSettings")) {
                return;
            }
        }

        const roomCode = this.fakeWorker.generateCode();

        const workercreate = await this.fakeWorker.emit(
            new WorkerBeforeCreateEvent(ev.client, ev.gameOptions, roomCode)
        );

        if (!workercreate.canceled) {
            const room = await this.fakeWorker.createRoom(roomCode, ev.gameOptions);
            
            this.fakeWorker.logger.info(
                "%s created room %s on %s with %s impostors and %s max players (%s).",
                fmtClient(ev.client), Int2Code(roomCode),
                GameMap[ev.gameOptions.map], ev.gameOptions.numImpostors, ev.gameOptions.maxPlayers, room.uuid
            );
            this.createFakeClient(ev.client);
            ev.client.redirectedTo = "fakeworker";
            ev.client.send(
                new ReliablePacket(
                    ev.client.getNextNonce(),
                    [
                        new HostGameMessage(roomCode)
                    ]
                )
            );
        }
    }

    @OnEvent("loadbalancer.beforejoin")
    async loadBalancerBeforeJoin(ev: LoadBalancerBeforeJoinEvent) {
        if (!ev.canceled) {
            const fakeClient = this.createFakeClient(ev.client);
            ev.client.redirectedTo = "fakeworker";
            this.fakeWorker.decoder.emitDecoded(
                new JoinGameMessage(ev.gameCode),
                MessageDirection.Serverbound,
                fakeClient
            );
        }
        ev.cancel();
    }
    
    @OnMessage(UnreliablePacket)
    async onUnreliablePacket(message: UnreliablePacket, direction: MessageDirection, sender: Client) {
        if (!this.server.isLoadBalancer())
            return;
        
        if (sender.redirectedTo !== "fakeworker")
            return;

        const childrenToPass = message.children.filter(child =>
            child.tag !== RootMessageTag.HostGame && child.tag !== RootMessageTag.JoinGame);

        if (childrenToPass.length) {
            const fakeWorkerClient = this.fakeWorker.clients.get(sender.address);

            if (!fakeWorkerClient)
                return;

            this.fakeWorker.decoder.emitDecodedSerial(
                new UnreliablePacket(
                    childrenToPass
                ), direction, fakeWorkerClient); // Pass messages straight through to the worker node
        }
    }

    @OnMessage(ReliablePacket)
    async onReliablePacket(message: ReliablePacket, direction: MessageDirection, sender: Client) {
        if (!this.server.isLoadBalancer())
            return;
        
        if (sender.redirectedTo !== "fakeworker")
            return;

        const childrenToPass = message.children.filter(child =>
            child.tag !== RootMessageTag.HostGame && child.tag !== RootMessageTag.JoinGame);

        if (childrenToPass.length) {
            const fakeWorkerClient = this.fakeWorker.clients.get(sender.address);

            if (!fakeWorkerClient)
                return;

            this.fakeWorker.decoder.emitDecodedSerial(
                new ReliablePacket(
                    message.nonce,
                    childrenToPass
                ), direction, fakeWorkerClient); // Pass messages straight through to the worker node
        }
    }
}