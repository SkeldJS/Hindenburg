import { DisconnectReason } from "@skeldjs/constant";
import { WorkerNode } from "../../src";

export function getPluginInfo() {
    return {
        name: "RequireHostMods",
        description: "Forces players joining a room to have the same mods as the host of the room."
    };
}

export function loadPlugin(server: WorkerNode, config: any) {
    server.on("worker.beforejoin", ev => {
        if (!ev.foundRoom)
            return;

        if (server.config.reactor) {
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
    });
}