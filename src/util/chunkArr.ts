// https://stackoverflow.com/a/60762482
type Grow<T, A extends Array<T>> = ((x: T, ...xs: A) => void) extends ((...a: infer X) => void) ? X : never;
type GrowToSize<T, A extends Array<T>, N extends number> = { 0: A, 1: GrowToSize<T, Grow<T, A>, N> }[A["length"] extends N ? 0 : 1];

export type FixedArray<T, N extends number> = GrowToSize<T, [], N>;

export function chunkArr<T, N extends number>(arr: T[], num: N): FixedArray<T, N>[] {
    if (num === 0) {
        throw new RangeError("Chunk size cannot be 0");
    }

    const output = [];
    for (let i = 0; i < arr.length; i += num) {
        output.push(arr.slice(i, num));
    }

    return output as FixedArray<T, N>[];
}
