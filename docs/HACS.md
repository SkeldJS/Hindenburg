# HACS
HACS is Hindenburg's sophisticated and highly customisable Anti-Cheat. It stands
for **H**indenburg **A**nti-**C**heat **S**ystem, as well as being the name of a
[British anti-aircraft fire-control system](https://en.wikipedia.org/wiki/HACS), and being pronounced "hacks".

_Credit to [miniduikboot](https://github.com/miniduikboot) for the name_

HACS intercepts packets before they reach the room and before they are processed,
meaning that cheaters get banned before they can change anything.

## Goals
HACS itself could stop at being a basic anti-cheat, preventing obvious protocol
cheats such as sending packets as someone else, doing things that only the
host has the ability to do, or even just entering vents despite not being the
Impostor.

While this alone could be helpful in cracking down cheaters, it still leaves room
for cheaters to do things that would be difficult to spot normally, such as knowing
who the impostors are. it also leaves room for the host, who has full authority
over the room, to do whatever they like and to change the game however they like.

HACS intends to do 2 central things to combat these 2 issues specifically:
- Only send absolutely necessary information to clients.
- Make sure that the flow of the game is going exactly as how a normal client would
behave.

For example, sending absolutely necessary information would mean only broadcasting
movement packets from players to only the players within view, or only telling the
impostors who the impostors are.

And ensuring that the flow of the game is correct would mean, for example, making
sure that the host does not change the impostors during the game, or breaking the
game in any way.

These do come with challenges however, and become very difficult to nail down
perfectly. For example, it's difficult to know whether omitting certain information
for clients will break the game in any unintended way, let alone the difficulty
in knowing what information to send and what to block. Legitimate lag can also
be something to be careful about, as ensuring that the flow of the game remains
consistent with a normal client can risk missing packets or lag messing it up
and reporting false positives.

These challenges are still combatible though, with extensive research and testing,
and taking inconsistencies like lag into account. This is the goal of HACS.

HACS also attempts to prevent cheaters from doing things that are naturally very
difficult for a program to detect, such as cheaters going outside of bounds or
completing tasks away from the task's console.

One issue with a strict Anti-Cheat, however, is that it can sometimes prevent
mods from functioning correctly. This is fixed through 2 ways:
- Allow server owners to modify every single part of the Anti-Cheat, down to the
very acceptable range of values.
- Allow plugins that work with client mods with override parts of the anti-cheat,
or even add their own functions for their mods.

Of course, the worst result of HACS would mean that even the official client
would be prevented from functioning correctly, so it's important that it is
updated immediately to any protocol changes, and that any inaccuracies are fixed
quickly.

# Configuration
HACS can be configured via Hindenburg's [config.json](https://github.com/SkeldJS/Hindenburg/blob/master/docs/Configuration.md),
in the `anticheat` object.

## `maxConnectionsPerIp`
The maximum number of connections that can come from a single ip address. Set to
0 to have no particular limit.

**Default:** `0`

## `banMessage`
The message to show to players when they have been banned. Can contain special
symbols that will be replaced.

| Symbol |                     Description                     |
|--------|-----------------------------------------------------|
| `%s`   | The time for how long the client is banned for.     |
| `%i`   | The anti-cheat rule that the client was banned for. |

For example, 

`You have been banned for %s for breaking '%i'`

Will be seen as

`You have been banned for 5 hours for breaking 'checkSettings'.`

Although it's recommended not to include the reason for why the client was banned,
as this can give clues to the cheater how to avoid a ban in the future.

**Default:** `"You were banned for %s for hacking."`

### Rules
Every rule can be either a boolean or an object containing more information.

There are 3 base properties that can be configured for each rule, if providing
an object:
|    Property   |   Type  |                                             Description                                             |     Default     |
|---------------|---------|-----------------------------------------------------------------------------------------------------|-----------------|
| `penalty`     | string  | The penalty that a player who breaks the rule will receive, can be "ban", "disconnect" or "ignore". | `disconnect`    |
| `strikes`     | integer | The number of strikes that a player who breaks this rule can receive before being penalised.        | `0`             |
| `banDuration` | number  | How long a player who breaks this rule will be banned for, in seconds.                              | `3600` (1 Hour) |

Every other property represents fine-tuning of the rule, although all are enabled
by default and must be disabled by setting them to `false`

#### `checkSettings`
Check for invalid game options before creating a game, or when updating them in
the lobby. Enabled by default.

#### `checkObjectOwnership`
Check if a player sends a packet for a component that they don't own, or for
components that are under ownership of the room itself. Enabled by default.

#### `hostChecks`
Check for host-only packets being sent by non-hosts. Enabled by default.

#### `malformedPackets`
Check if packets are malformed and are unable to be parsed by Hindenburg. Disabled
by default.

#### `invalidFlow`
Check if a player does something out of line, something that doesn't normally come
from an official client. Enabled by default.

#### `invalidName`
Check if a player has an invalid name. Enabled by default.

|     Property    |        Type       |                                  Description                                 |
------------------|-------------------|------------------------------------------------------------------------------|
| `changedTwice`  | boolean           | Check if a player has already set their name.                                |
| `wrongName`     | boolean           | Check if a player has set a name different to the name they identified with. |
| `badHostChecks` | boolean           | Check if a host checked the name wrong, e.g. they set a name that is already taken. |
| `invalidChars`  | boolean or object | Check if a name contains invalid characters, can also be an object.<br><br><table><thead><tr><th>Property</th><th>Type</th><th>Description</th></tr></thead><tbody><tr><td>`regex`</td><td>string</td><td>Regex to match an invalid name. Default `[^a-zA-Z0-9]`</td></tr></tbody></table>
| `maxNameLength` | integer | Check if a name is over a certain limit, default `10`. |

#### `invalidColor`
Check if a player has an invalid color. Enabled by default.
|    Property    |   Type  |                                               Description                                              |
|----------------|---------|--------------------------------------------------------------------------------------------------------|
| `colorTaken`   | boolean | Check if a host checked the name wrong, e.g. they set a name that is already taken.                    |
| `invalidColor` | boolean | Check if a player set their colour to an invalid colour. (i.e. one that is not on the colour palette.) |

#### `massivePackets`
Check if packets are a lot larger than packets normally sent by the game. Enabled
by default, with a simple disconnect after 3 strikes.

### Notes
![Screenshot of miniduikboot saying "bonus points if you call it HACS, the Hindenburg Anti Cheat System"](https://user-images.githubusercontent.com/60631511/121056339-0235fd00-c7b6-11eb-974a-3c3f179794c3.png)