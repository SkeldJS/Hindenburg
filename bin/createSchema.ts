import "./modulePatch";

import path from "path";
import fs from "fs/promises";
import { iteratePlugins } from "./util/iteratePlugins";
import { importPlugin } from "./importPlugin";

const configFile: string = process.env.HINDENBURG_CONFIG || path.join(process.cwd(), "./config.json");
const configFileDirectory = path.dirname(configFile);

async function findConfigSchemaFilename() {
    try {
        const ts = path.resolve(__dirname, "../misc/config.schema.json");
        await fs.stat(ts);
        return ts;
    } catch (e: any) {
        if (e.code === "ENOENT") {
            return path.resolve(__dirname, "../../misc/config.schema.json");
        }

        throw e;
    }
}

export default async () => {
    const configSchemaJson = process.env.IS_PKG
        ? JSON.parse(await fs.readFile(await findConfigSchemaFilename(), "utf8"))
        : {
            "allOf": [{ "$ref": "/" + await findConfigSchemaFilename() }],
            "properties": {
                "plugins": {
                    "properties": {}
                }
            }
        };

    for await (const pluginDirectory of iteratePlugins()) {
        try {
            const importedPlugins = await importPlugin(pluginDirectory);
            const schemaPath = path.resolve(configFileDirectory, path.resolve(pluginDirectory, "config.schema.json"));
            try {
                await fs.stat(schemaPath);

                configSchemaJson.properties.plugins.properties[importedPlugins.meta.id] = {
                    "anyOf": [
                        {
                            "$ref": "/" + schemaPath
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

    await fs.writeFile(path.resolve(configFileDirectory, "./config.schema.json"), JSON.stringify(configSchemaJson), "utf8");
};
