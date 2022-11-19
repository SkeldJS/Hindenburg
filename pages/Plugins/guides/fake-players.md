You can create "fake players" in Hindenburg that aren't connected to any client or connection. These players can be created and destroyed at an instant.

You can, for most tasks, use {@link BaseRoom.createFakePlayer}, as it's a thin wrapper over {@link BaseRoom.spawnPrefabOfType} with some helper options.

## Realistic players
If you want the fake players to appear like they _are_ connected to a real client to other clients,

_This section is a stub_

## Note on invisible players
_This section is a stub_

## Perspectives
Perspectives don't (currently) support spawning and despawning objects. However, they _do_ support GameData filters, so you can spawn the player for all clients, and, using what we know from the [Note on invisible players](#note-on-invisible-players) section, we can hide or show the player for each perspective.

_This section is a stub_

