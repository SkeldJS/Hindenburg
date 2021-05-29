import { HindenburgConfig } from "../../src/Node";

export function makeConfig(config: HindenburgConfig, externalIp: string) {
    for (const cluster of config.loadbalancer.clusters) {
        if (cluster.ip === "auto") {
            cluster.ip = externalIp;
        }
    }

    if (config.loadbalancer.ip === "auto") {
        config.loadbalancer.ip = externalIp;
    }

    if (config.cluster.ip === "auto") {
        config.cluster.ip = externalIp;
    }

    return config;
}