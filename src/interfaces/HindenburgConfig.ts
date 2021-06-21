export interface AnticheatConfig {
    store: "redis"|"file";
    file: string;
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

export interface HindenburgConfig {
    plugins: Record<string, any>;
    anticheat: AnticheatConfig;
}