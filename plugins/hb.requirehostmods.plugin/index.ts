import { WorkerBeforeJoinEvent } from "../../src/events";

import { DeclarePlugin } from "../../src/plugins/hooks/DeclarePlugin";
import { OnEvent } from "../../src/plugins/hooks/OnEvent";
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
    server!: WorkerNode;

    @OnEvent("worker.beforejoin")
    async workerBeforeJoin(ev: WorkerBeforeJoinEvent) {
        if (!ev.foundRoom)
            return;

        if (this.server.config.reactor) {
            const host = ev.foundRoom.clients.get(ev.foundRoom.hostid);

            if (!host?.mods) {
                if (ev.client.mods?.length) { // Check if the client has mods while the host does not.
                    return ev.client.joinError(
                        "Invalid mods loaded for this room: ",
                        ev.client.mods.map(mod => mod.id).join(", ")
                    );
                } else {
                    return;
                }
            }

            if (!ev.client.mods) { // Exit if the client is not using reactor.
                ev.cancel();
                return ev.client.joinError(
                    "Missing required mods for this room: %s.",
                    host.mods.map(mod => mod.id).join(", ")
                );
            }

            for (const cmod of ev.client.mods) { // Loop through joining client's mods
                const found = host.mods
                    .find(mod => mod.id === cmod.id);

                
                if (found) {
                    if (found.version !== cmod.version) { // Check if the version of the mod is invalid.
                        ev.cancel();
                        return ev.client.joinError(
                            "Invalid version for mod %s: %s (Needs %s).",
                            cmod.id, cmod.version, found.version
                        );
                    }
                } else {
                    ev.cancel(); // Host does not have this mod
                    return ev.client.joinError(
                        "Invalid mod loaded for this room: %s (%s)",
                        cmod.id, cmod.version
                    );
                }
            }
            
            for (const hmod of host.mods) { // Loop through host's mods.
                const found = ev.client.mods
                    .find(mod => mod.id === hmod.id);
                
                if (!found) {
                    ev.cancel(); // Joining client does not have this mod.
                    return ev.client.joinError(
                        "Missing mod for this room: %s (%s)",
                        hmod.id, hmod.version
                    );
                }
            }
        }
    }
}