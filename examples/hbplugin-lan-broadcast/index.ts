import { GameOptions } from "@skeldjs/protocol";
import dgram from "dgram";

import {
    EventListener,
    HindenburgPlugin,
    Plugin,
    WorkerBeforeJoinEvent
} from "../../src";

@HindenburgPlugin({
    id: "hbplugin-lan-broadcast",
    version: "1.0.0",
    order: "none"
})
export default class extends Plugin {
    async onPluginLoad() {
        const lanBroadcaster = dgram.createSocket("udp4");
        const buf = Buffer.from([
            0x04,
            0x02,
            ...Buffer.from("<size=150%><voffset=-1em>Hindenburg~Open~<color=#80cc06>Join Local</color>)<alpha=#00></voffset>\n~", "utf8")
        ]);

        lanBroadcaster.bind(() => {
            lanBroadcaster.setBroadcast(true);
        });
        setInterval(() => {
            lanBroadcaster.send(buf, 47777, "255.255.255.255"); // broadcast ip
        }, 50);
    }

    @EventListener("worker.beforejoin")
    async onWorkerBeforeJoin(ev: WorkerBeforeJoinEvent) {
        if (ev.gameCode === 0x20) {
            if (!this.worker.lobbies.has(0x20)) {
                const localLobby = await this.worker.createLobby(0x20, new GameOptions);
                ev.setLobby(localLobby);
            }
        }
    }
}