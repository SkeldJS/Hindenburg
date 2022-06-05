/**
 * Recursively compare one value to another value. Can be any type, but will
 * compare two objects recursively to make sure their properties are not the same.
 * @param a The first object to compare.
 * @param b The object to compare {@link a} against.
 */
export function recursiveCompare(a: any, b: any) {
    if (typeof a !== typeof b)
        return false;

    if (typeof a !== "object" && a !== b)
        return false;

    const aKeys = Object.keys(a);
    for (let i = 0; i < aKeys.length; i++) {
        const key = aKeys[i];
        if (!recursiveCompare(a[key], b[key]))
            return false;
    }

    const bKeys = Object.keys(b);
    for (let i = 0; i < bKeys.length; i++) {
        const key = bKeys[i];
        if (typeof a[key] === "undefined")
            return false;
    }

    return true;
}
