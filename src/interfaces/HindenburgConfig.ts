export interface AnticheatConfig {
    penalty: {
        action?: "disconnect"|"ban"|"ignore";
        strikes?: number;
        banAfterXDisconnects?: number;
        banDuration?: number;
        disconnectMessage?: string;
    }
    rules: Record<string, AnticheatRuleConfig>;
}

export interface AnticheatRuleConfig {
    penalty: {
        action?: "disconnect"|"ban"|"ignore";
        strikes?: number;
        banAfterXDisconnects?: number;
        banDuration?: number;
        disconnectMessage?: string;
    };
    [key: string]: any;
}

export interface PluginConfig {
    loadDirectory: boolean;
    [key: string]: any;
}

export interface SocketConfig {
    port: number;
}

export interface HindenburgConfig {
    clusterName: string;
    nodeId: number;
    socket: SocketConfig;
    plugins: PluginConfig;
    anticheat: AnticheatConfig;
}