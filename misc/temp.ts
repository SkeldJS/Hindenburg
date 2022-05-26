export interface JsonSchema {
    id?: string;
    $schema?: string;
    $extends?: string;
    description?: string;
    default?: any;
    multipleOf?: number;
    maximum?: number;
    exclusiveMaximum?: number;
    minimum?: number;
    exclusiveMinimum?: number;
    maxLength?: number;
    minLength?: number;
    pattern?: string;
    additionalItems?: boolean|JsonSchema;
    items?: JsonSchema|JsonSchema[];
    maxItems?: number;
    minItems?: number;
    uniqueItems?: boolean;
    maxProperties?: number;
    minProperties?: number;
    required?: string[];
    additionalProperties?: boolean|JsonSchema;
    definitions?: Record<string, JsonSchema>;
    properties?: Record<string, JsonSchema>;
    patternProperties?: Record<string, JsonSchema>;
    dependencies?: JsonSchema|string[];
    enum?: any[];
    type?: string|string[];
    allOf?: JsonSchema[];
    anyOf?: JsonSchema[];
    oneOf?: JsonSchema[];
    not?: JsonSchema;
}

export type JsonSchemaAsInterface<X extends JsonSchema> =
    X extends { anyOf: JsonSchema[] }
        ? JsonSchemaAsInterface<X["anyOf"][number]>
        : X extends { type: string[] }
            ? JsonSchemaAsInterface<X & { type: X["type"][number] }>
            : X extends { type: "array" }
                ? X extends { items: JsonSchema[] }
                    ? JsonSchemaAsInterface<X["items"][number]>[]
                    : X extends { items: JsonSchema }
                        ? JsonSchemaAsInterface<X["items"]>[]
                        : never
                : X extends { type: "string" }
                    ? string
                    : X extends { type: "boolean" }
                        ? boolean
                        : X extends { type: "integer"|"number" }
                            ? number
                            : X extends { type: "null" }
                                ? null
                                : X extends { properties: Record<string, JsonSchema> }
                                    ? {
                                        [K in keyof X["properties"]]: JsonSchemaAsInterface<X["properties"][K]>
                                    }
                                    : never;
