# HACS
HACS is Hindenburg's sophisticated and highly customisable Anti-Cheat. It stands
for **H**indenburg **A**nti-**C**heat **S**ystem, as well as being the name of a
[British anti-aircraft fire-control system](https://en.wikipedia.org/wiki/HACS). (As well as also being pronounced "hacks")

_Credit to [miniduikboot](https://github.com/miniduikboot) for the name_

## Prelude
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
in knowing which information to send and what to block. Legitimate lag can also
be something to be careful about, as ensuring that the flow of the game remains
consistent with a normal client can risk missing packets or lag messing it up
and reporting false positives.

These challenges are still combatible though, with extensive research and testing,
and taking inconsistencies like lag into account. This is the goal of HACS.

HACS also attempts to prevent cheaters from doing things that are naturally very
difficult for a program to detect, such as cheaters going outside of bounds or
completing tasks away from the task's console.

The challenge with a strict Anti-Cheat, however, is that it can sometimes prevent
mods from functioning correctly. This is fixed through 2 ways:
- Allow server owners to modify every single part of the Anti-Cheat, down to the
very acceptable range of values.
- Allow plugins that work with client mods with override parts of the anti-cheat,
or even add their own functions for their mods.

## Configuration

"lorem ipsum"

### Notes

![Screenshot of miniduikboot saying "bonus points if you call it HACS, the Hindenburg Anti Cheat System"](https://user-images.githubusercontent.com/60631511/121056339-0235fd00-c7b6-11eb-974a-3c3f179794c3.png)