import polka from "polka";

export function json() {
    return async (req: polka.Request, res: Response, next: polka.Next) => {
        if (req.method !== "POST" && req.method !== "PUT" && req.method !== "PATCH") return next();

        const contentType = req.headers["content-type"];

        if (typeof contentType !== "string" || !contentType.includes("application/json")) return next();

        try {
            let body = "";
            for await (const chunk of req) {
                body += chunk;
            }

            (req as any).body = JSON.parse(body) || {};
            next();
        } catch (error: unknown) {
            (req as any).body = {};
            next();
        }
    };
}
