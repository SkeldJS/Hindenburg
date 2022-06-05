/**
 * Create a new object with the same values as {@link a}, but such that none
 * reference the same place in memory.
 * @param a The base object to clone.
 */
export function recursiveClone(a: any): any {
    if (typeof a !== "object") {
        return a;
    }

    if (Array.isArray(a)) {
        return a.map(x => recursiveClone(x));
    }

    const newObj: any = {};
    const aKeys = Object.keys(a);
    for (let i = 0; i < aKeys.length; i++) {
        const key = aKeys[i];
        newObj[key] = recursiveClone(a[key]);
    }
    
    return newObj;
}
