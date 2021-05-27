import { DisconnectReason } from "@skeldjs/constant";

import { WorkerBeforeJoinEvent } from "../../src/events";

import { DeclarePlugin } from "../../src/plugins/hooks/DeclarePlugin";
import { Listener } from "../../src/plugins/hooks/Listener";
import { PluginInfo } from "../../src/plugins/Plugin";
import { WorkerNode } from "../../src/WorkerNode";

@DeclarePlugin({
    id: "hb.requirehostmods.plugin",
    version: "1.0.0",
    description: "Allows players to assign their own game code to their games.",
    defaultConfig: {},
    clientSide: false,
    loadBalancer: true
})
export default class CustomGameCodePlugin {
    meta!: PluginInfo;
    server!: WorkerNode;

    @Listener("worker.beforejoin")
    async workerBeforeJoin(ev: WorkerBeforeJoinEvent) {
        if (!ev.foundRoom)
            return;

        if (this.server.config.reactor) {
            const host = ev.foundRoom.clients.get(ev.foundRoom.hostid);
            
            if (!host?.mods)
                return;

            if (!ev.client.mods) {
                ev.cancel();
                return ev.client.joinError(
                    DisconnectReason.Custom,
                    "Missing required mods: %s.",
                    host.mods.map(mod => mod.id).join(", ")
                );
            }

            for (const cmod of ev.client.mods) {
                const found = host.mods
                    .find(mod => mod.id === cmod.id);

                
                if (found) {
                    if (found.version !== cmod.version) {
                        ev.cancel();
                        return ev.client.joinError(
                            DisconnectReason.Custom,
                            "Invalid version for mod %s: %s (Needs %s).",
                            cmod.id, cmod.version, found.version
                        );
                    }
                } else {
                    ev.cancel();
                    return ev.client.joinError(
                        DisconnectReason.Custom,
                        "Invalid mod loaded for this room: %s (%s)",
                        cmod.id, cmod.version
                    );
                }
            }
            
            for (const hmod of host.mods) {
                const found = ev.client.mods
                    .find(mod => mod.id === hmod.id);
                
                if (!found) {
                    ev.cancel();
                    return ev.client.joinError(
                        DisconnectReason.Custom,
                        "Missing mod for this room: %s (%s)",
                        hmod.id, hmod.version
                    );
                }
            }
        }
    }
}