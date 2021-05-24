import { WorkerNode } from "../../src";

export function getPluginInfo() {
    return {
        name: "testPlugin"
    };
}

export function loadPlugin(server: WorkerNode, config: any) {
    server.on("player.chat", chat => {
        server.logger.info("player said %s", chat.message);
    });
}