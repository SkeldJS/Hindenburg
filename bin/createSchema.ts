import path from "path";
import fs from "fs/promises";
import { iteratePlugins } from "./util/iteratePlugins";
import { importPlugin } from "./importPlugin";

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
            const importedPlugins = await importPlugin(pluginDirectory);
            const schemaPath = path.resolve(pluginDirectory, "config.schema.json");
            try {
                await fs.stat(schemaPath);
    
                configSchemaJson.properties.plugins.properties[importedPlugins.meta.id] = {
                    "anyOf": [
                        {
                            "$ref": schemaPath.startsWith("/") ? schemaPath : "/" + schemaPath
                        },
                        {
                            "type": "boolean"
                        }
                    ]
                };
            } catch (e) {
                configSchemaJson.properties.plugins.properties[importedPlugins.meta.id] = {
                    "anyOf": [
                        {
                            "type": "object"
                        },
                        {
                            "type": "boolean"
                        }
                    ]
                };
            }
        } catch (e) {
            void e;
        }
    }

    await fs.writeFile(path.resolve(configFileDirectory, "./config.schema.json"), JSON.stringify(configSchemaJson, undefined, 4), "utf8");
};
