import fs from "fs/promises";
import path from "path";

export async function getRootOfPackage(entrypoint: string, base: string): Promise<string> {
    const packageJsonFilename = path.resolve(base, "./package.json");
    try {
        const packageJson = await fs.readFile(packageJsonFilename, "utf8");
        const packageJsonJson = JSON.parse(packageJson);

        if (packageJsonJson.main) {
            if (path.normalize(packageJsonJson.main) === path.relative(base, entrypoint)) {
                return base;
            }
        } else {
            if (base === path.dirname(entrypoint)) {
                return base;
            }
        }

        if (base === "/" || base === "." || base === "") {
            throw new Error("Could not find root of package.");
        } else {
            return getRootOfPackage(entrypoint, path.dirname(base));
        }
    } catch (e) {
        return getRootOfPackage(entrypoint, path.dirname(base));
    }
}

export async function findRootOfPackage(entrypoint: string) {
    if (!path.isAbsolute(entrypoint))
        throw new SyntaxError("Expected absolute path to entrypoint");

    return await getRootOfPackage(entrypoint, path.dirname(entrypoint));
}
