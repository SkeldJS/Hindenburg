If you don't already know, _Innernet Objects_ in Among Us are used to create state for some aspect of the game, and to network and sync that state between clients. A player, for example, has three innernet objects dedicated to keeping state about various things; `PlayerControl` for general behaviours, `PlayerPhysics` for movement states (e.g. ladders, vent, etc.) and `CustomNetworkTransform` for movement positions.

In Hindenburg, in order to facilitate event safety and clear code flow, has the idea of objects being _owned_ by either perspectives, or main rooms. In this way, for example, if a meeting is started by a player inside a perspective, while the meeting may be synced to every other client, nominally the meeting is said to be _owned_ by that perspective. That means that the server will only perform host operations (i.e. handle votes, spawning, meeting ends, etc.) on that perspective, and the main room will simply listen for changes.

> Note that this only really applies if the server has SaaH enabled, see {@page ../../getting-started/using-hindenburg/server-as-a-host.md}.

In practice, this means that certain events that are host-only won't be able to be listened on by the main room, since they don't own the object. This does, fortunately, only applies to a small sub-set of events, for example the {@link PlayerDieEvent | `player.die`} event:

```ts
export class ImpostorDieHandler extends EventTarget {
    @EventListener("player.die")
    onPlayerDie(ev: PlayerDieEvent<BaseRoom>) {
        if (ev.player.playerInfo?.roleType !== ImpostorRole)
            return;

        const perspective = ev.room.playerPerspectives.get(ev.player.clientId);
        const impostorPov = perspective?.resolvePlayer(ev.player);

        if (!impostorPov)
            return;

        impostorPov?.control?.setName(impostorPov.playerInfo!.defaultOutfit!.name.replace("<color=red>Impostor</color>", "<color=gray>Dead</color>"));
    }
}

@HindenburgPlugin("hbplugin-role-tags")
export class RoleTagsPlugin extends RoomPlugin {
    @EventListener("player.setrole")
    onPlayerSetRole(ev: PlayerSetRoleEvent<Room>) {
        if (ev.newRole !== ImpostorRole)
            return;

        const perspective = ev.room.createPerspective(ev.player);
        const impostorPov = perspective.resolvePlayer(ev.player);

        const impostorDieHandler = new ImpostorDieHandler;

        this.room.registerEventTarget(impostorDieHandler);
        perspective.registerEventTarget(impostorDieHandler);

        impostorPov?.control?.setName("<color=red>Impostor</color>\n" + impostorPov.playerInfo!.defaultOutfit!.name);
    }
}
```

> See {@page ../api/event-targets.md} for more information.

This is significant as `player.die` is a _host-only_ event, and with object ownerships, that means that only the room that _owns_ the object that kills the player will receive the event.

There are many sources of a players' death, for example _meetings_, which is an object under the `MeetingHud` name. If a player _inside_ a perspective starts a meeting, that meeting belongs to their perspective. When the meeting ends, and kills a player once they are exiled, only the perspective will receive the event that they have died.

However, listening to events on the perspective is _not enough_, as if the meeting is instead spawned by a player on the main room, then the meeting will belong to the main room. Then, when a player is exiled towards the end of the meeting, only the main room will receive the even that they have died.

The solution to this is to use the {@link EventTarget} API, as shown in the code above:
```ts
const impostorDieHandler = new ImpostorDieHandler;

this.room.registerEventTarget(impostorDieHandler);
perspective.registerEventTarget(impostorDieHandler);
```

This will listen for the event on either the room or the plugin, depending on where the death event comes from.
