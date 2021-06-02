import { PlayerSetNameEvent } from "@skeldjs/core";

import { DeclarePlugin } from "../src/plugins/hooks/DeclarePlugin";
import { OnEvent } from "../src/plugins/hooks/OnEvent";
import { WorkerNode } from "../src/WorkerNode";

@DeclarePlugin({
    id: "hb.mymod.plugin",
    version: "1.0.0",
    description: "tis my mod.",
    defaultConfig: {},
    clientSide: false,
    loadBalancer: true
})
export default class CustomGameCodePlugin {
    server!: WorkerNode;

    @OnEvent("player.setname")
    async playerSetName(ev: PlayerSetNameEvent) {
        ev.message?.cancel();
    }
}