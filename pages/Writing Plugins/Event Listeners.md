# Event Listeners
One of the core parts of writing plugins with Hindenburg is the ability to define
listeners for events that are emitted anywhere in the server.

In line with SkeldJS, all events emitted from anywhere in individual rooms are
propagated upwards to the server.

Hindenburg naturally inherits [all events from SkeldJS](https://skeld.js.org/pages/Information/Events.html),
and also allows you to use the same API for them.

## Hindenburg Events
* {@link WorkerBeforeJoinEvent | `worker.beforejoin`}
* {@link ClientBanEvent | `client.ban`}
* {@link ClientConnectEvent | `client.connect`}
* {@link RoomBeforeDestroyEvent | `room.beforedestroy`}
* {@link RoomBeforeCreateEvent | `room.beforecreate`}
* {@link RoomCreateEvent | `room.create`}
* {@link RoomDestroyEvent | `room.destroy`}
* {@link RoomSelectHostEvent | `room.selecthost`}

## Declaring Events
Instead of attaching events directly to the worker via the constructor or the
[onPluginLoad](./Plugin%20Lifecycle%20Methods) method, Hindenburg allows you to
use a special decorator, meaning that your plugin can be properly unloaded
and cleaned up. It also looks sick.

```ts
import {
    HindenburgPlugin,
    EventListener,
    Room
} from "@skeldjs/hindenburg";

import { PlayerSetNameEvent } from "@skeldjs/core";

@HindenburgPlugin({
    id: "",
    version: "1.0.0",
    order: "none"
})
export default class extends Plugin {
    @EventListener("player.setname")
    onPlayerSetName(ev: PlayerSetNameEvent<Room>) {
        ev.setName("<color=red>" + ev.newName + "</color>");
    }
}
```

See the page on [splitting plugins into several files](./Splitting%20Plugin%20Listeners)

### Caveats
A long-standing [issue within Typescript](https://github.com/Microsoft/TypeScript/issues/4881)
forces you to declare the types for every event manually. Hopefully this will
soon be resolved.
