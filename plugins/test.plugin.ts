import { WorkerNode } from "../src";

export function getPluginInfo() {
    return {
        name: "testPlugin"
    };
}

export function loadPlugin(node: WorkerNode, config: any) {
    node.on("player.chat", chat => {
        node.logger.info("player said", chat.message);
    });
}