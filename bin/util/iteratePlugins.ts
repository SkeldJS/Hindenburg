import path from "path";
import fs from "fs/promises";
import resolvePkg from "resolve-pkg";

const pluginsDirectories: string[] = process.env.HINDENBURG_PLUGINS?.split(",").map(x => x.trim()) || [ path.resolve(process.cwd(), "./plugins") ];

export async function* iteratePlugins() {
    for (const pluginsDirectory of pluginsDirectories) {
        const packageJsonText = await fs.readFile(path.resolve(pluginsDirectory, "package.json"), "utf8");
        const packageJson = JSON.parse(packageJsonText);

        if (packageJson.dependencies) {
            for (const dependencyName in packageJson.dependencies) {
                if (!dependencyName.startsWith("hbplugin-"))
                    continue;

                const packageLocation = resolvePkg(dependencyName, { cwd: pluginsDirectory });

                if (!packageLocation)
                    continue;

                yield packageLocation;
            }
        }

        const filenames = await fs.readdir(pluginsDirectory);
        for (const filename of filenames) {
            if (!filename.startsWith("hbplugin-"))
                continue;

            const filePath = path.resolve(pluginsDirectory, filename);
            const stat = await fs.stat(filePath);

            if (stat.isDirectory()) {
                yield filePath;
            }
        }
    }
}
