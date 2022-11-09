The Among Us protocol stores game codes as integers, as converts them into their string representations to display to the user, and decodes them when a user inputs one.

> If you're a server owner looking to set which version of game codes to use, see [Configuration#rooms.gameCodes](https://skeldjs.github.io/Hindenburg/Getting%20Started/Configuration.html#roomsgamecodes).

## Versions
There are two versions of games codes used in Among Us:
- V1, with 4 alphanumeric digits (All ascii characters from uppercase `A` to lowercase `z`).
- V2, with 6 uppercase alphabetic digits

## Conversion
SkeldJS exports a `GameCode` class utility to convert game codes.

You can use `GameCode.convertIntToString` to get a string representation of a code to display in the console or to a user, and `GameCode.convertStringToInt` to serialize it as a 32-bit integer.

> See {@link GameCode} for more methods and utilities.
