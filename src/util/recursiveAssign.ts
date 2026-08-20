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
    if (source === null || source === undefined || typeof source !== "object") {
        return;
    }

    const sourceKeys = Object.keys(source);
    for (let i = 0; i < sourceKeys.length; i++) {
        const key = sourceKeys[i];
        const targetValue = target[key];
        const sourceValue = source[key];
        if (
            sourceValue !== null && sourceValue !== undefined &&
            typeof targetValue === "object" && targetValue !== null &&
            typeof sourceValue === "object"
        ) {
            if (Array.isArray(targetValue) || Array.isArray(sourceValue)) {
                target[key] = sourceValue;
                continue;
            }

            recursiveAssign(targetValue, sourceValue, options);
        } else if (typeof sourceValue !== "undefined") {
            target[key] = sourceValue;
        }
    }

    if (options.removeKeys) {
        const targetKeys = Object.keys(target);
        for (let i = 0; i < targetKeys.length; i++) {
            const key = targetKeys[i];
            if (typeof source[key] === "undefined") {
                delete target[key];
            }
        }
    }
}
