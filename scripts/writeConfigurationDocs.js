const fs = require("fs/promises");
const path = require("path");

const configSchema = require("../misc/config.schema.json");

/**
 * @typedef JsonSchema
 * @property {string?} id
 * @property {JsonSchema?} $schema
 * @property {string?}
 * @property {string?} description
 * @property {any?} default
 * @property {number?} multipleOf
 * @property {number?} maximum
 * @property {boolean?} exclusiveMaximum
 * @property {number?} minimum
 * @property {boolean?} exclusiveMinimum
 * @property {number?} maxLength
 * @property {number?} minLength
 * @property {string?} pattern
 * @property {boolean|JsonSchema?} additionalItems
 * @property {JsonSchema|JsonSchema[]?} items
 * @property {number?} maxItems
 * @property {number?} minItems
 * @property {boolean?} uniqueItems
 * @property {number?} maxProperties
 * @property {number?} minProperties
 * @property {string[]?} required
 * @property {boolean|JsonSchema?} additionalProperties
 * @property {{ [key: string]: JsonSchema }} definitions
 * @property {{ [key: string]: JsonSchema }} properties
 * @property {{ [key: string]: JsonSchema }} patternProperties
 * @property {{ [key: string]: JsonSchema|string[] }} dependencies
 * @property {any[]} enum
 * @property {string|string[]} type
 * @property {JsonSchema[]} allOf
 * @property {JsonSchema[]} anyOf
 * @property {JsonSchema[]} oneOf
 * @property {JsonSchema} not
 */

let baseDocs = `Hindenburg has an easy-to-use JSON file for configuring the whole server. \
Hindenburg will look for a config.json in the current working directory, or if the \
\`HINDENBURG_CONFIGS\` environment variable is set to an absolute filename of the config.json \
to use, check out the [Environment Variables](./Environment%20Variables) page for more information.

# Configuration Values\n`;

/**
 * @param {any} value
 * @returns {string}
 */
function formatValue(value) {
    if (value === "(none)") {
        return value;
    }

    if (Array.isArray(value)) {
        return "[ " + value.map(formatValue).join(", ") + " ]";
    } else if (typeof value === "string") {
        return "\"" + value + "\"";
    } if (typeof value === "object") {
        const entries = Object.entries(value);
        if (entries.length === 0) {
            return "{}";
        } else {
            let out = "**Default: **\n```json\n";
            for (const [ propName, propValue ] of entries) {
                out += "    \"" + propName + "\": " + formatValue(propValue);
            }
            return out;
        }
    }

    return value.toString();
}

/**
 * @param {JsonSchema} schema
 */
function createSchemaDescription(schema) {
    const outParts = [];

    if (schema.description) {
        outParts.push(schema.description);
    }

    if (schema.type) {
        if (Array.isArray(schema.type)) {
            const listFmt = schema.type.slice(0, schema.type.length - 1).join(", ") + " or " + schema.type[schema.type.length - 1];
            outParts.push("**Type**: " + listFmt);
        } else {
            outParts.push("**Type**: " + schema.type);
        }
    }

    if (schema.default) {
        const formatted = formatValue(schema.default);
        if (formatted.includes("\n")) {
            outParts.push("**Default**:\n```json\n" + formatted + "\n```");
        } else {
            outParts.push("**Default**: `" + formatted + "`");
        }
    }

    if (schema.enum) {
        outParts.push("Any of the following: "
            + schema.enum.sort().map(val => "**" + val + "**").join(", "));
    }

    return outParts.join("\n\n");
}

/**
 * @param {number} nestLevel
 * @param {string} schemaName
 * @param {JsonSchema} schema
 * @param {string} schemaPath
 */
function createProperties(nestLevel, schemaName, schema, schemaPath) {
    let out = "";

    if (schema.anyOf) {
        const signatures = [];
        for (const sig of schema.anyOf) {
            signatures.push(createProperties(nestLevel, schemaName, sig, schemaPath));
        }
        out += "\n" + signatures.join("\n\n_or_\n\n");
    } else {
        const description = createSchemaDescription(schema);
        out += "\n" + description;
    }

    out += "\n\n";

    if (schema.properties) {
        const entries = Object.entries(schema.properties);
        for (const [ propertyName, propertyDetails ] of entries) {
            const propertyPath = schemaPath + "." + schemaName;
            out += "#".repeat(nestLevel) + " **" + propertyPath + "." + propertyName + "**";
            out += createProperties(nestLevel + 1, propertyName, propertyDetails, propertyPath);
        }
    }

    if (schema.patternProperties) {
        const entries = Object.entries(schema.patternProperties);
        for (const [ propertyPattern, propertyDetails ] of entries) {
            const propertyName = propertyPattern === ".+" ? "*" : propertyPattern;
            const propertyPath = schemaPath + "." + schemaName;
            out += "#".repeat(nestLevel) + " **" + propertyPath + "." + propertyName + "**";
            out += createProperties(nestLevel + 1, propertyName, propertyDetails, propertyPath);
        }
    }

    if (schema.items) {
        if (Array.isArray(schema.items)) {
            for (const propertyDetails of schema.items) {
                const propertyPath = schemaPath + "." + schemaName;
                out += "#".repeat(nestLevel) + " **" + propertyPath + "[]**";
                out += createProperties(nestLevel + 1, "[]", propertyDetails, propertyPath);
            }
        } else {
            const propertyPath = schemaPath + "." + schemaName;
            out += "#".repeat(nestLevel) + " **" + propertyPath + "[]**";
            out += createProperties(nestLevel + 1, "[]", schema.items, propertyPath);
        }
    }

    return out;
}

const entries = Object.entries(configSchema.properties);
for (const [ propertyName, propertyDetails ] of entries) {
    baseDocs += "##".repeat(1) + " " + "config." + propertyName + "";
    baseDocs += createProperties(3, propertyName, propertyDetails, "config");
}

(async () => {
    await fs.writeFile(path.resolve(__dirname, "../pages/Getting Started/Configuration.md"), baseDocs)
})();
