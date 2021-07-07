export interface RecursiveAssignOptions {
    /**
     * Whether to remove keys in **target** that don't exist in **source**.
     */
    removeKeys?: boolean;
}

/**
 * Recursively assign an object to another object, assigning keys in child objects
 * instead of completely overwriting them.
 * @param target The target object to assign keys to.
 * @param source The sources to get values from.
 * @param options Options for the assign operation.
 */
export function recursiveAssign(target: any, source: any, options: RecursiveAssignOptions = {}) {
    const sourceKeys = Object.keys(source);
    for (const key of sourceKeys) {
        if (
            typeof target[key] === "object" &&
            typeof source[key] === "object"
        ) {
            recursiveAssign(target[key], source[key], options);
        } else if (typeof source[key] !== "undefined") {
            target[key] = source[key];
        }
    }

    if (options.removeKeys) {
        const targetKeys = Object.keys(target);
        for (const key of targetKeys) {
            if (typeof source[key] === "undefined") {
                delete target[key];
            }
        }
    }
}