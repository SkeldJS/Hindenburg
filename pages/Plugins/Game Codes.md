The Among Us protocol stores game codes as integers, as converts them into their string representations to display to the user, and decodes them when a user inputs one.

SkeldJS also uses game codes as integers throughout

> If you're a server owner looking to set which version of game codes to use, see [Configuration#rooms.gameCodes](https://skeldjs.github.io/Hindenburg/Getting%20Started/Configuration.html#roomsgamecodes).

## Versions
There are two versions of games codes used in Among Us:
- V1, with 4 alphanumeric digits (All ascii characters from uppercase `A` to lowercase `z`). Uses integer values `> 0`.
- V2, with 6 uppercase alphabetic digits. Uses integer values `< 0`

Both are stored as a single 32-bit integer.

## Conversion
SkeldJS exports a `GameCode` class utility to convert game codes.

You can use `GameCode.convertIntToString` to get a string representation of a code to display in the console or to a user, and `GameCode.convertStringToInt` to serialize it as a 32-bit integer.

> See {@link GameCode} for more methods and utilities.

## Special
The game code used for LAN games always has an integer value of `32`, Hindenburg will render this code as `LOCAL` in the console.
