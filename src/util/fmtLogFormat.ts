import * as util from "util";

/**
 * Format a log config formatting array, replacing the values with specified data.
 *
 * @see {@link LoggingConfig}
 * @param format The formatting array to format.
 * @param data The data to replace the formatting parts with.
 * @returns A formatted string.
 *
 * @example
 * ```
 * const formatArray: ("favouriteColor"|"age")[] = ["age"];
 *
 * console.log(
 *     fmtLogFormat(
 *         formatArray,
 *         {
 *             "favouriteColor": "black"
 *             "age": 5
 *         }
 *     )
 * ); // => 5
 * ```
 */
export function fmtConfigurableLog<T extends string>(format: T[], data: Record<T, any>) {
    return format
        .map(fmt => data[fmt])
        .filter(a => a !== undefined)
        .map(obj => obj[Symbol.for("nodejs.util.inspect.custom")] ? util.inspect(obj, false, 10, false) : obj)
        .join(", ");
}
