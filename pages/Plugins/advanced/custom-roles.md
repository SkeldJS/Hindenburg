Creating a custom role in Hindenburg is a surprisingly light concept, although that's only because most of your role logic (abilities, buttons, etc.) is done in the {@link PlayerControl} innernet object, such as the {@link PlayerControl.shapeshift} method.

> Check out the {@page ./custom-innernet-objects.md} or {@page ./handling-custom-rpcs.md} for more information.

## Notes for Modders
Note that this is _only_ a server-side construct, custom roles must also be added to each client using a client mod.

## Creating the Role Class
Creating a class for your role is extremely simple:
```ts
class MyRole extends BaseRole<Room> {
    static roleMetadata = {
        roleType: 60 as RoleType,
        roleTeam: RoleTeamType.Crewmate,
        isGhostRole: false
    }
}
```

Where `roleType` is a unique integer/enum value for your role, `roleTeam` is the team that your role is for, either {@link RoleTeamType.Crewmate} or {@link RoleTeamType.Impostor}, and `isGhostRole` is whether or not your role is assigned on a player's death, like the {@link GuardianAngelRole | Guardian Angel}.


## Registering the Role
Registering your role class is as simple as using the {@link RegisterRole} decorator and passing in your role class:
```ts
@RegisterRole(MyRole)
@HindenburgPlugin("hbplugin-fun-things")
export class FunThingsPlugin extends WorkerPlugin {

}
```

## Role Abilities
As noted above, you will have to implement role abilities/buttons either by extending the {@link PlayerControl} Innernet Object with your own {@page ./custom-innernet-objects.md Custom PlayerControl object), or by hooking into RPCs recieved with {@page ./handling-custom-rpcs.md} and sending yourself.

If you're making a full mod and not intending on having any other mods with conflicting roles, you should extend {@link PlayerControl} and implement your own rpc handlers and methods.

If you're making a partial mod and expecting other mods to implement their own roles, you should probably just handle custom RPCs for the {@link PlayerControl} class and send them yourself.
