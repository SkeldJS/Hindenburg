The Among Us protocol stores game codes as integers, as converts them into their string representations to display to the user, and decodes them when a user inputs one.

SkeldJS also uses game codes as integers throughout its API, see the [conversion](#conversion) section to read them as a formatting string.

> If you're a server owner looking to set which version of game codes to use, see [Configuration#rooms.gameCodes](https://hindenburg.js.org/pages/getting-started/configuration/index.html#roomsgamecodes).

## Versions
There are two versions of games codes used in Among Us:

### V1
V1 game codes have 4 alphanumeric digits (All ascii characters from uppercase `A` to lowercase `z`), and uses all integer values greater than `0`.

### V2
V2 codes have 6 uppercase alphabetic digits and use integer values lower than `0`.

Both are stored as a single 32-bit integer.

## API
SkeldJS exports a `GameCode` class utility to convert game codes.

> See the docs on {@link GameCode} for more methods and utilities.

## Generate codes
You can generate random codes using {@link GameCode.generateV1} and {@link GameCode.generateV2}:

```ts
// Generate a v1 4-digit code:
const code = generateV1();
```

```ts
// Generate a v2 6-digit code:
const code = generateV2();
```

## Conversion
You can use {@link GameCode.convertIntToString} to get a string representation of a code to display in the console or to a user, and {@link GameCode.convertStringToInt} to serialize it as a 32-bit integer:
```ts
@HindenburgPlugin("hbplugin-postmodern-lens")
export class PostmodernLensPlugin extends RoomPlugin {
    @ChatCommand("generate-code <version>")
    onGenerateCodeCommand(ctx: ChatCommandContext, args: any) {
        if (args === "1") {
            const code = GameCode.generateV1();
            ctx.reply("Generated code: %s", GameCode.convertIntToString(code));
        } else if (args === "2") {
            const code = GameCode.generateV2();
            ctx.reply("Generated code: %s", GameCode.convertIntToString(code));
        }
    }
}

```

## Events
The {@link RoomBeforeCreateEvent} allows you to modify a room's game code before it's set by the server.

For example:
```ts
@HindenburgPlugin("hbplugin-postmodern-lens")
export class PostmodernLensPlugin extends RoomPlugin {
    @EventListener("room.beforecreate")
    onRoomCreate(ev: RoomBeforeCreateEvent) {
        ev.setCode("AMOGUS"); // can also be an integer, or a v1 4-digit game code
    }
}
```

## LAN games
The game code used for LAN games always has an integer value of `32`, Hindenburg will render this code as `LOCAL` in the console.
