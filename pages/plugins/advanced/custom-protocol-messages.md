If you have a mod, it might be of interest to create custom protocol messages to communicate additional information between your client and the server.

> See {@page ./receiving-protocol-messages.md} for information on actaully receiving your messages from the client. This page is just to declare them.

## Message Types
As per how the Among Us protocol is structured, messages can be declared on certain levels and as children of certain parent messages. For example, messages that are identified by the first byte are called _option_ packets, although you most likely won't be using these as they're part of [Hazel](https://github.com/willardf/Hazel-Networking) itself.

With that in mind, you can declare messages by extending the relevant class:
| Type | Description | Identifier | Parent message | Base class |
|------|-------------|------------|----------------|------------|
| **Root** | Used for reliable/unreliable messages, related to stateless communication between the client and the server. | `root` | {@link ReliablePacket}/{@link UnreliablePacket} | `BaseRootMessage` |
| **GameData** | Used for messages that are related to the game, and communicate with a little bit of state involved. | `gamedata` | {@link GameDataMessage} | `BaseGameDataMessage` |
| **Rpc** |  (Remote Procedure Call) Used for messages in games that communicate directly to objects, and are heavily based on recording state. | `rpc` | {@link RpcMessage} | `BaseRpcMessage` |

## Message Class
> Check out the [SkeldJS source](https://github.com/SkeldJS/SkeldJS/tree/master/packages/protocol/lib/packets) for full, proper examples.

Check the [table above](#message-types) to know which base class your message class should extend.

### Example
```ts
export class SayHelloMessage extends BaseRootMessage {
    static messageTag = 60 as const;
    messageTag = 60 as const;

    constructor(public readonly message: string) {
        super();
    }

    static Deserialize(reader: HazelReader) {
        const message = reader.string();
        return new MyRootMessage(message);
    }

    Serialize(writer: HazelWriter) {
        writer.string(this.message);
    }

    clone() {
        return new MyRootMessage(this.message);
    }
}
```

### Message tag
The `messageTag` property should be any unused integer, as long as it's the same as the tag that the client sends. This is just used to identfiy your message and decode it when it's encountered.

> The `messageTag` should generally be between `0-255`, especially for official Among Us message types.

> Note that other mods may have their own message tags, so make sure that other mods that you use don't conflict with your message tags.

## Registering custom messages
Use the {@link RegisterMessage} decorator to register your custom message to be recognised by Hindenburg:
```ts
@RegisterMessage(SayHelloMessage)
@HindenburgPlugin("hbplugin-mouse-messager-plugin")
export class MouseMessagerPlugin extends WorkerPlugin {

}
```

> Note that custom messages can _only_ be instantiated and used on a {@page ../worker-and-room-plugins.md worker plugin}.

> Check out {@page ./receiving-protocol-messages.md} to learn how to handle your custom messages sent by clients.

## Sending custom messages
Sending custom messages in Hindenburg is just as simple as instantiating the class, for example:
```ts
connection.sendPacket(
    new ReliablePacket(
        connection.getNextNonce(),
        [
            new SayHelloMessage("there's a mouse! where? there on the stair, right there!")
        ]
    )
);
```
