Innernet objects (INOs, or _components_) in Among Us allow you to netwok state between clients. There are many different INOs that are spawned with prefabs, which define a set of innernet objects to spawn as part of a group.

Some INOs can belong to individual players, and some can belong to the room itself - which can only be controlled by the host (or if in {@page ../../getting-started/using-hindenburg/server-as-a-host.md}, the server).

## Server-side only
_Note_ that objects defined and registered on Hindenburg _only_ apply to server-side logic, and aren't by default handled on the client in any meaningful way - they'll just be discarded; the client doesn't know what to do with them.

Therefore, objects created on the server should simply be a re-creation of the ones on the client so as to provide an API for plugins. You can also implement the host logic for your INOs on the server, to protect some sensitive code that might otherwise be abused for cheating.

## Defining Innernet Objects
Since Hindenburg builds on-top of SkeldJS, you can follow the [guide on the SkeldJS docs](https://skeld.js.org/pages/Guides/Creating%20Custom%20INOs.html) to create your own.

## Registering Prefabs
Once you've created your innernet objects, you can register them to Hindenburg (either to a room or to the server) with the {@link RegisterPrefab} decorator.

For example, if you had a way to spawn buttons using a prefab, you might have 2 components for graphical rendering and handling clicks, i.e. `GraphicRenderer` and `ClickBehaviour`:
```ts
export class GraphicRenderer<RoomType extends Hostable> extends Networkable<RoomType> {
    ...
}

export class ClickBehaviour<RoomType extends Hostable> extends Networkable<RoomType> {
    ...
}

export enum MyCustomSpawnTypes {
    Button
}

@RegisterPrefab(MyCustomSpawnTypes.Button, [ GraphicRenderer, ClickBehaviour ])
@HindenburgPlugin("hbplugin-epic-role-mod")
export class EpicRoleModPlugin extends RoomPlugin {

}
```

## Spawning Prefabs
Use {@link BaseRoom.spawnPrefabOfType} to create a new baby into the world:
```ts
const spawnedButton = this.room.spawnPrefabOfType(MyCustomSpawnType.Button, player /* create the button belonging to the player */);
```

## Despawning objects
And to despawn an innernet object that you've created, simply call the {@link Networkable.despawn | `.despawn()`} method on it:

```ts
...

spawnedButton.despawn();
```

### Despawning whole prefabs
More often than not, you'll be despawning the _entire_ prefab that you created, not just one or two of the components. For that, you can simply loop through the child components:
```ts
for (const component of spawnedButton.components) {
    component.despawn();
}
```

> Note that the {@link Networkable.components} array contains the actual object itself, per how Unity's Entity-Component system works.
