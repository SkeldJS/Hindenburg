# Writing Plugins
Since Hindenburg is built upon [SkeldJS](https://github.com/skeldjs/SkeldJS),
it inherits much of the same API and so much of the documentation can be found
[there](https://skeldjs.github.io/SkeldJS).

Plugins leverage the power of [TypeScript Decorators](https://www.typescriptlang.org/docs/handbook/decorators.html)
to make your plugins concise and reliable

The basic interfaces of a plugin, for example the events it listens to, are
contained entirely within a single class - although this is not to stop you
from splitting your logic and other utilities into several other files to keep
readability.

## Skeleton
A very simple plugin that does absolutely nothing would look something along
the lines of this:

```ts
@DeclarePlugin({
    id: "",
    version: "",
    description: "",
    defaultConfig: {},
    clientSide: false,
    loadBalancer: false,
    order: "none"
})
export default class {
    constructor(
        public readonly server: LoadBalancerNode|WorkerNode, // The server that this plugin will work on.
        public readonly config: any // The configuration for this plugin.
    ) {}
}
```

### DeclarePlugin options
|      Field      |  Type   |                                      Description                                       | Default  |
|-----------------|---------|----------------------------------------------------------------------------------------|----------|
| `id`            | string  | A unique plugin identifier.                                                            | _None_   |
| `version`       | string  | The current version of the plugin.                                                     | _None_   |
| `description`   | string  | A short summary of what your plugin does.                                              | _None_   |
| `defaultConfig` | object  | Default configuration object ofr your plugin.                                          | _None_   |
| `clientSide`    | boolean | Whether this plugin works together with a client mod.                                  | `false`  |
| `loadBalancer`  | boolean | Whether this plugin works on the load balancer.                                        | `false`  |
| `order`         | string  | The order at which this plugin is loaded, `"first"`, `"last"`, or `"none"`             | `"none"` |

## Events
Plugins use a short and simple syntax in order to declare event listeners. Using
special decorators, they are also automatically removed if the plugin were to ever
be unloaded.

##### Note: Currently the syntax used for events is slightly more verbose than would be ideal, follow https://github.com/Microsoft/TypeScript/issues/4881 for more information on this.

### Declaring an event listener
You can use the `@OnEvent` decorator above a method on your plugin class to use
it for listening to a specific event.

```ts
@OnEvent("player.chat")
onPlayerChat(ev: PlayerChatEvent) {
    console.log("%s sent %s in chat", ev.player.data.name, ev.message);
}
```

### Events to listen to
A Hindenburg server naturally inherits [all core events from SkeldJS](https://skeldjs.github.io/SkeldJS/pages/Information/Events.html#event-list)
as well as some additional ones listed below:

#### Client
* `client.disconnect` - Emitted when a client disconnects or is disconnected
from the server.

#### Load Balancer
* `loadbalancer.beforecreate` - Emitted before a client is redirected to a worker
server to create a room.
* `loadbalancer.beforejoin` - Emitted before a client is redirected to a worker
server to join a room.

#### Worker
* `worker.beforecreate` - Emitted before a room is created on this worker server.
* `worker.beforejoin` - Emitted before a player joins a room that was created on
this worker server.

## Custom Protocol Messages
Plugins also allow you to register custom protocol messages and listen to them easily.
Hindenburg also naturally inherits [SkeldJS'](https://skeldjs.github.io/SkeldJS/modules/protocol.html)
[PacketDecoder](https://skeldjs.github.io/SkeldJS/classes/protocol.packetdecoder.html)
class and thus custom messages can be created using the same API.

See [here](https://skeldjs.github.io/SkeldJS/pages/Guides/Writing%20Custom%20Protocol%20Messages.html)
for information regarding how to write custom messages.

### Declaring a custom message
Custom messages must be registered at the top of your plugin using the
`@RegisterMeesage` decorator.

For example, using the [skeleton](#skeleton) example from above, we can register
custom messages to add. Messages that are used in place of default messages will
overwrite them and clear all of their listeners.

```ts
@DeclarePlugin({
    id: "",
    version: "",
    description: "",
    defaultConfig: {},
    clientSide: false,
    loadBalancer: false,
    order: "none"
})
@RegisterMessage(MyFavouriteMessage) // Register my favourite message.
export default class {
    constructor(
        public readonly server: LoadBalancerNode|WorkerNode,
        public readonly config: any
    ) {}
}
```

### Listen to Messages
You can listen to messages using the `@OnMessage` decorator above a method on your
plugin class.

```ts
@OnMessage(MyFavouriteMessage)
onMyFavouriteMessage(message: MyFavouriteMessage, direction: MessageDirection, sender: Client) {
    console.log("Got my favourite message from %s.", client.id);
}
```

### Advanced Usage
The `@OnMessage` decorator also takes in additional options.

|  Option  |                    Description                   | Default |
|----------|--------------------------------------------------|---------|
| override | Override all existing listeners for this message | `false` |

For example,
```ts
@OnMessage(HelloPacket, { override: true })
onHelloPacket(message: HelloPacket, direction: MessageDirection, client: Client) {
    client.disconnect("Sorry you can't play :///");
}
```

## Examples
Examples of some plugins can be found [here](https://github.com/SkeldJS?q=hbplugin)
and show both simple and advanced usages of the plugin API.

## Publishing Plugins
A few rules must apply when publishing plugins to NPM or some other registry,
if all these rules apply to your published plugin then you can make a PR to
add them to the list of [Officially Recognised Plugins](https://github.com/SkeldJS/Hindenburg/blob/master/docs/Installing%20Plugins.md#officially-recognised-plugins).

* The package name that plugins are distributed under are always prefixed with
`hbplugin-`, this is to help it stand out and make it easier to search for,
as well as to make them identifiable and consistent.

* It must have a clear, accessible repository for accessing the source of the
plugin. This is to encourage co-operative open source development and also as a
way to give back to the Hindenburg community.

* Plugins written in TypeScript must always be built to Javascript before being
published.

* Plugins for an outdated version of Hindenburg will be removed unless updated.