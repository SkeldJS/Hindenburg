To a degree, it is possible to create entire roles using entirely server code, making it work even on Vanilla clients.

This guide will outline and explain the (general) steps you should take to create your own role.

> Note that this guide _requires_ {@page ../../getting-started/using-hindenburg/server-as-a-host.md} to be enabled.

Specifically, we'll be creating the reasonably basic Jester role, and we'll be going through how you can analyse the game's code for yourself to bypass restrictions.

> Only very basic knowledge of programming is required for this guide, although the concepts do get somewhat complicated.

## Create the plugin
Obviously, you'll need to actually create the plugin. See {@page ../creating-a-plugin.md} to get started, or you can just run `yarn plugins create my-jester-mod` in your Hindenburg directory for a quick-start.

> In this guide we'll be using [TypeScript](https://typescriptlang.org), so make sure you enable that while creating your plugin.

## Create the role class
We can use SkeldJS' role implementation to create a role _dummy_ of sorts, that acts as a placeholder for simply stating that the player _is_ the Jester; the role class itself won't do any logic.

> See {@page ../advanced/custom-roles.md} for more information.

This is as simple as the following (in a new file, probably):
```ts
import {
    BaseRole,
    RoleTeamType,
    RoleType
} from "@skeldjs/hindenburg";

export class JesterRole extends BaseRole {
    static roleMetadata = {
        roleType: RoleType.Crewmate,
        roleTeam: RoleTeamType.Crewmate,
        isGhostRole: false
    };
}
```

The `JesterRole` class here extends the {@link BaseRole} class from SkeldJS; which is an essentially empty class but helps identify it and will make the class work with SkeldJS' type system, as it will recognise that it's a descendent of `BaseRole`.

The _`roleMetadata`_ here will be identical to that of a Crewmate, since otherwise we would drop support for Vanilla clients. It doesn't matter, though, as this jester role only needs to exist on the server anyway.

Other than that, this file is fairly light and doesn't have any logic. So far so good.

> Make sure to export everything from this file by writing `export * from "./<file name>.ts";` in the `src/index.ts` file.

For example, I've created a `jesterRole.ts` file, with the code above inside:
![image](https://user-images.githubusercontent.com/60631511/201498357-1f794e8a-780e-49d9-bb3d-047fd94e526b.png)

## Assigning the role to a player
### Event listener
We can take advantage of SkeldJS' {@link RoomAssignRolesEvent | `room.assignroles`} event to assign the Jester role (unofficially, the client will still think they're a Crewmate other than cosmetics which we'll set [later](#setting-jester-cosmetics)).

Attaching a listener to your plugin will do the trick:
```ts
@EventListener("room.assignroles")
onAssignRoles(ev: RoomAssignRolesEvent<Room>) {

}
```

> See the page on {@page ../api/event-listeners.md} for more information.

> Note the `<Room>` generic is required to notify SkeldJS' type system that this event should come from one of Hindenburg's rooms.

### Assign logic
We don't need to worry about the complexities of assigning roles in Among Us. Instead, we can just write code to first gather all of the crewmates who don't have a role, and pick a random one out of those. There are a few ways to do this, but this is how I did it:
```ts
const crewmatePool = [];
for (const [ player, assignedRole ] of ev.roleAssignments) {
    if (assignedRole !== ImpostorRole) {
        if (player.playerInfo)
            crewmatePool.push(player);
    }
}

const randomCrewmateIdx = Math.floor(Math.random() * crewmatePool.length);
const crewmate = crewmatePool[randomCrewmateIdx];
```

Here, it's probably a good idea to store the jester somewhere to reference in other parts of the code, so try creating a property on the plugin class that should store the jester, like so:

```ts
@HindenburgPlugin("hbplugin-bg-gamemodes-jester")
export class BgGamemodesJesterPlugin extends RoomPlugin {
    jester?: PlayerData<Room>;

    ...
}
```

> The `?` marks that the jester either might not exist, or hasn't been set just quite _yet_. This is just for type safety with TypeScript.

With that property created, you can then assign the jester to that random crewmate you selected. Although, you should probably check that a crewmate was actually found before we proceed. For example, back inside our `onAssignRoles` method:
```ts
if (crewmate === undefined)
    return;

this.jester = crewmate;
```

Oh, and since we'll be changing the Jester's name later in the [cosmetics](#setting-jester-cosmetics) section, we should probably store what their original name was so we can reset it and set it again later.

Another property on the plugin class is needed:
```ts
@HindenburgPlugin("hbplugin-bg-gamemodes-jester")
export class BgGamemodesJesterPlugin extends RoomPlugin {
    jester?: PlayerData<Room>;
    originalJesterName: string = "";

    ...
}
```

And to set the jester's original name property, back in the `onAssignRoles` method:
```ts
this.originalJesterName = this.jester.playerInfo!.currentOutfit.name;
```

Now that we've found our jester and done a bit of caching with the jester's original name, we can simply tell SkeldJS to assign this role to the client:
```ts
ev.setAssignment(this.jester, JesterRole as typeof BaseRole);
```

> Note, the cast to `typeof BaseRole` is required as TypeScript is a bit difficult with matching class constructors, i.e. it can't detect fully that `JesterRole` extends `BaseRole`.

So, our plugin should look _something_ like this:
```ts
@HindenburgPlugin("hbplugin-bg-gamemodes-jester")
export class BgGamemodesJesterPlugin extends RoomPlugin {
    jester?: PlayerData<Room>;
    originalJesterName: string = "";

    constructor(public readonly room: Room, public config: BgGamemodesJesterPluginConfig) {
        super(room, config);
    }

    @EventListener("room.assignroles")
    onAssignRoles(ev: RoomAssignRolesEvent<Room>) {
        const crewmatePool = [];
        for (const [ player, assignedRole ] of ev.roleAssignments) {
            if (assignedRole !== ImpostorRole) {
                if (player.playerInfo)
                    crewmatePool.push(player);
            }
        }

        if (crewmatePool.length === 0)
            return;

        this.jester = crewmatePool[Math.floor(Math.random() * crewmatePool.length)] as PlayerData<Room>;
        this.originalJesterName = this.jester.playerInfo!.currentOutfit.name;
        if (!this.jester)
            return;

        ev.setAssignment(this.jester, JesterRole as typeof BaseRole);
    }
}
```

## Setting jester cosmetics
A crucial part of having a custom role is for the player to be able to identify that they have been assigned that role, and since we don't have access to the client to create a mod, we'll have to manually set cosmetics that give the appearance of a jester to make it obvious. More notably, we can set the name _with colours_ to create a "tag" or "role" system in the players' names, for instance `[Jester] weakeyes`.

### Creating the perspective
We can use Hindenburg's {@page ../advanced/player-perspectives.md} to create an environment where only the Jester can see their cosmetics, and everyone else sees them as normal. This gives the same effect as how only the Impostor can see their names as red, whereas everyone else sees it as white.

First, we'll need to create a `jesterPerspective` property on the class so we can store the perspective and destroy it later, when the jester gets voted out and the game ends:
```ts
@HindenburgPlugin("hbplugin-bg-gamemodes-jester")
export class BgGamemodesJesterPlugin extends RoomPlugin {
    jester?: PlayerData<Room>;
    jesterPerspective?: Perspective;
    originalJesterName: string = "";

    ...
}
```

> This can also be `?` (optional), as it won't exist at all times; only when a jester is playing/has been set.

A good event to use for knowing when to create the perspective is the {@link PlayerSetRoleEvent | `player.setrole`} event, which will be fired almost immediately after the one we used when assigning the role:
```ts
@EventListener("player.setrole")
async onSetRole(ev: PlayerSetRoleEvent<Room>) {

}
```

Now remember that this event can come from any player, so it's worth checking that we're actually dealing with the jester here. A good way to do this is to check that {@link PlayerSetRoleEvent | `ev.newRole`} is equal to our jester role:
```ts
@EventListener("player.setrole")
async onSetRole(ev: PlayerSetRoleEvent<Room>) {
    if (ev.newRole !== JesterRole)
        return; // quit if the player in question is not becoming a jester
}
```

in that same method, we can create the jesters' perspective:
```ts
this.logger.info("%s is now a jester", ev.player);

this.jesterPerspective = this.room.createPerspective(this.jester, [], [ PresetFilter.GameDataUpdates ]);
```

The _outgoing filter_ `PresetFilter.GameDataUpdates` is used to prevent the Jester's cosmetics and tagged name from being updated on the other players' screens.

> Reading the page on {@page ../advanced/player-perspectives.md} is recommended here.

### Setting the cosmetics
Still in your `onSetRole` method, we can simply get the jesters' player in the room and set all of their cosmetics using SkeldJS' API.
```ts
const jesterPov = this.jesterPerspective.resolvePlayer(this.jester); // get the jesters' player on their perspective, since the jester we have is the same player in the main room

if (!jesterPov || !jesterPov.control) // for type safety, check if these two variables actually exist before using them
    return;

jesterPov.control.setName("<color=purple>[Jester]</color> " + this.originalJesterName);
jesterPov.control.setHat(Hat.Partyhat);
jesterPov.control.setSkin(Skin.Clown);
jesterPov.control.setPet(Pet.EmptyPet);
```

We should now see _two_ changes:
![image](https://user-images.githubusercontent.com/60631511/201499213-7445beb4-75c9-4c77-b9a1-a13813e67b81.png)
![image](https://user-images.githubusercontent.com/60631511/201499218-a7b8334d-a5e6-4523-9f1b-9a6e7ca339cc.png)

### Fixing bugs
One thing you might notice if you played this now, is that the Jester's cosmetics never appear properly in meetings; that is, they will appear as a normal character.

This bug is simply something we didn't consider with our perspective and its filters: since the main room never knows of the jesters' cosmetics (as it's contained within their perspective), and we have no _incoming filters_ to block updates from the main room, the main room will send an update to the perspective to update their GameData/cosmetics info (likely to update their role), thus overriding what we set it to in their perspective.

> Overriding GameData won't immediately update the player, hence why it only shows after-the-fact in meetings. The {@link SetNameMessage}, {@link SetColorMessage}, {@link SetHatMessage}, {@link SetPetMessage}, {@link SetSkinMessage} can be used for immediate updates.

> For more information on how innernet objects keep state, see {@page ../advanced/custom-innernet-objects.md}.

To fix this, we have to create our own _incoming filter_ to prevent this exact thing.

So, just after our line that creates our perspective:
```ts
this.jesterPerspective = this.room.createPerspective(this.jester, [], [ PresetFilter.GameDataUpdates ]);

...
```

We can create our own incoming filter:
```ts
this.jesterPerspective.incomingFilter.on(DataMessage, message => {
    if (!this.jesterPerspective || !this.jester)
        return;

    const obj = this.jesterPerspective.netobjects.get(message.netId);

    if (!obj || !(obj instanceof GameData))
        return;

    ...
});
```

After the last `return;` in this piece of code, `message` is certain to be coming from an update for the GameData message, containing cosmetics updates. As this message in particular may be overriding the cosmetics that we set for the Jester, we ought to check and process it in a special way if it does, so as to prevent an override.

#### Check that the jesters' cosmetics are being overriden
The {@link GameData} update message is formatted as a dictionary from player ID -> player cosmetics. We can do a quick skim over this dictionary to find whether or not the jesters' player ID appears inside it.

Firstly, get the jesters' player ID:
```ts
const jesterPov = this.jesterPerspective.resolvePlayer(this.jester);

if (!jesterPov || !jesterPov.playerInfo)
    return;

const jesterPlayerId = jesterPov.playerInfo.playerId;
```

Next, skim through the GameData update and check if the player appears:
```ts
let flag = false;
const reader = HazelReader.from(message.data);
while (reader.left) {
    const [ playerId ] = reader.message();
    if (playerId === jesterPov.playerInfo.playerId) {
        flag = true;
        break;
    }
}
```

#### Process the gamedata message specially to prevent the Jester's cosmetics from being overriden
The idea here is to _cancel_ the message, so as to stop the perspectve from processing it. Instead, we'll process it manually and re-set the Jesters' cosmetics straight after:
```ts
if (flag) {
    message.cancel();
    obj.Deserialize(reader, false);

    jesterPov.playerInfo.setName(PlayerOutfitType.Default, "<color=purple>[Jester]</color> " + this.originalJesterName);
    jesterPov.playerInfo.setHat(PlayerOutfitType.Default, Hat.Partyhat);
    jesterPov.playerInfo.setSkin(PlayerOutfitType.Default, Skin.Clown);
    jesterPov.playerInfo.setPet(PlayerOutfitType.Default, Pet.EmptyPet);
}
```

## Jester getting voted out
Now, things from here start to get a bit more tricky and specific. Luckily, the Jester has fairly simple gameplay changes - just check if a jester gets ejected after a meeting.

From what we know in {@page ../topics/object-ownership-guards.md} and {@page ../api/event-targets.md}, we'll have to create event listeners on both the _main room_ and the _Jester's perspective_ to listen for meetings.

> This is because, if the meeting is started by the Jester, then the meeting is said to _belong_ to the perspective, whereas if the meeting is started by another player, then the meeting _belongs_ to the main room.

This doesn't have to make perfect sense right now, as it only requires an extra single line.

### Creating the event target
Either way, we should create an _event target_ to host the events that we need to listen for. This can act as our sort-of "jester behaviour" class, which handles all of the logic for the jester. This warrants a new file in my opinion. This file can initially be simply:
```ts
import { EventTarget } from "@skeldjs/hindenburg";
import { BgGamemodesJesterPlugin } from "./plugin";

export class JesterRoleBehaviour extends EventTarget {
    constructor(protected readonly plugin: BgGamemodesJesterPlugin) {
        super();
    }

    @EventListener("room.gameend")
    onGameEnd(ev: RoomGameEndEvent) {
        this.plugin.room.removeEventTarget(this);
    }
}
```

Note that this class has a `plugin` parameter for your plugin to pass itself into. This is just so we can reference it in the event target itself.

The last part with the {@link RoomGameEndEvent | `room.gameend`} event is a precaution to make sure event listeners don't stick around on the event even once the game has ended. This doesn't impact the perspective, as we'll destroy that at the end of the match anyway.

My file structure now looks like the following:
![image](https://user-images.githubusercontent.com/60631511/201499386-1cf6d8e2-d52e-4098-9aa7-f242c4c5d4c9.png)

> Remember to also export this file in your `src/index.ts` file with `export * from "./jesterRoleBehaviour";`

### Registering the event target
Back in your `onSetRole` method in your plugin, you can attach the following code at the end:
```ts
const jesterRoleBehaviour = new JesterRoleBehaviour(this);
this.room.registerEventTarget(jesterRoleBehaviour);
this.jesterPerspective.registerEventTarget(jesterRoleBehavour);
```

This will create an instance of the event target that we created, and register it both on the room and the jesters' perspective, as discussed earlier.

### Writing the event handler
Now, in our new event target class, we can register a {@link PlayerDieEvent | `player.die`} to handle when the player gets ejected from the meeting:
```ts
@EventListener("player.die")
async onPlayerDie(ev: PlayerDieEvent<Room>) {
    if (!this.plugin.jester || !this.plugin.room.gameData)
        return;

    if (ev.reason !== "exiled")
        return;

    if (ev.player.clientId !== this.plugin.jester.clientId)
        return;

    ...
}
```

The series of checks here should be fairly obvious, but they're just to make sure we're handling the right kind of death and for the right player.

> Note that the `ev.player.clientId !== this.plugin.jester.clientId` matches client IDs rather than player reference, as the event might refer to the jester in the perspectve while the plugin one refers to the jester in the main room, thus beng different references.

Now, very simply to get this all working, we can simply end the game:
```ts
this.plugin.room.registerEndGameIntent(
    new EndGameIntent(
        "jester voted out",
        GameOverReason.ImpostorByVote,
        {
            jester: this.plugin.jester!
        }
    )
);
```

## End game screen
You'll notice that in the last end game screen, the winner always shows as the impostor, even though the Jester won the game.

To fix this, we'll need to break the game a little bit.

Now, the first idea is to simply re-set everyone's role before the game ends so that the Jester becomes the impostor, the impostors becomes crewmates and crewmates stay as crewmates. For example, before your line for `this.plugin.room.registerEndGameIntent`:
```ts
for (const [ , player ] of this.plugin.room.players) {
    if (!player.control)
        continue;

    if (player === this.plugin.jester) {
        player.control.setRole(ImpostorRole);
    } else {
        player.control.setRole(CrewmateRole);
    }
}
```

This _would_ work. However, the Among Us client has several locks in place to prevent the role from being re-assigned after being initially assigned.

One way to get around this is to consider that the locks exist _only_ on the GameData instance. Therefore, the idea is to _despawn_ the GameData instance, and _respawn it_ immediately after with the new roles set.

So, instead of the code above:
```ts
if (this.plugin.jesterPerspective)
    await this.plugin.jesterPerspective.destroyPerspective();

const gameDataPlayers = this.plugin.room.gameData.players;
this.plugin.room.gameData!.despawn();

for (const [ , playerInfo ] of gameDataPlayers) {
    if (playerInfo.playerId === this.plugin.jester.playerId) {
        playerInfo.roleType = ImpostorRole;
    } else {
        playerInfo.roleType = CrewmateRole;
    }
}

this.plugin.room.spawnPrefabOfType(SpawnType.GameData, -2, 0, [
    {
        players: gameDataPlayers
    }
], true, false);
```
