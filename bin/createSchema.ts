import path from "path";
import fs from "fs/promises";
import { iteratePlugins } from "./util/iteratePlugins";

const configFile: string = process.env.HINDENBURG_CONFIG || path.join(process.cwd(), "./config.json");
const configFileDirectory = path.dirname(configFile);

export default async () => {
    const configSchemaJson = {
        $extends: path.relative(configFileDirectory, path.resolve(__dirname, "../misc/config.schema.json")),
        properties: {
            plugins: {
                properties: {

                } as Record<string, any>
            }
        }
    };

    for await (const pluginDirectory of iteratePlugins()) {
        try {
            const packageJsonText = await fs.readFile(path.resolve(pluginDirectory, "package.json"), "utf8");
            const packageJson = JSON.parse(packageJsonText);
            const schemaPath = path.resolve(pluginDirectory, "config.schema.json");
            await fs.stat(schemaPath);

            configSchemaJson.properties.plugins.properties[packageJson.name] = { "$ref": schemaPath.startsWith("/") ? schemaPath : "/" + schemaPath };
        } catch (e) {
            void e;
        }
    }

    await fs.writeFile(path.resolve(configFileDirectory, "./config.schema.json"), JSON.stringify(configSchemaJson, undefined, 4), "utf8");
};
