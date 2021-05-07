const units = [
    [604800, "week"],
    [86400, "day"],
    [3600, "hour"],
    [60, "minute"],
    [0, "second"]
] as [number, string][];

export function formatSeconds(seconds: number, base: string[] = []): string {
    if (!seconds)
        return base.join(", ");

    for (const unit of units) {
        if (seconds >= unit[0]) {
            const val = ~~(seconds / unit[0]);
            base.push(val + " " + unit[1] + (val === 1 ? "" : "s"));
            seconds %= unit[0];
            return formatSeconds(seconds, base);
        }
    }

    return base.join(", ");
}