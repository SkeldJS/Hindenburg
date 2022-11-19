While the SkeldJS API covers almost every aspect of Among Us, it might still be necessary to go even further down. This is where instead of listening to events that are emitted by SkeldJS for things that happen, you can listen directly for messages received via the Among Us protocol.

> You can only override and create messages handlers on worker plugins.

> If you're writing custom innernet objects with custom Rpc methods, check out the {@page ./handling-custom-rpcs.md} page for a much more suitable API.

## Attaching Listeners
The {@link MessageHandler | `MessageHandler`} decorator can be used with a method to denote it as being used to listen for messages.

For example:
```ts
@HindenburgPlugin("hbplugin-fun-things")
export class FunThingsPlugin extends WorkerPlugin {
    @MessageHandler(EndGameMessage)
    async onEndGameMessage(message: EndGameMessage, ctx: PacketContext) {
        await ctx.sender.room?.destroy(); // destroy the room as soon as the game ends
    }
}
```

You can pass in [any valid protocol message class](https://skeld.js.org/modules/protocol.html) as the first argument.

> If you're using custom protocol messages, you may have to register them with Hindenburg; check out the {@page ./custom-protocol-messages.md} page.

The body of your method can be marked as [_async_](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/async_function), and takes in 2 parameters:
#### `message`
This is an instance of the message that you are listening for, after being through the message class' [Deserialize](https://skeld.js.org/classes/protocol.BaseMessage.html#Deserialize) method.

In TypeScript, the type of this parameter _must_ be an instance of the message class that you passed into the `@MessageHandler` decorator.

#### `ctx`
An object containing some basic context information about the packet. Check the docs for {@link PacketContext} for information.

## Overriding Default Behaviour
By default, the `@MessageHandler` decorator will attach a listener on top of any existing ones; meaning it gets called alongside those.

If, however, you wanted to override the default behaviour of the message, you can pass in options to `@MessageHandler`:

```ts
@HindenburgPlugin("hbplugin-fun-things")
export class FunThingsPlugin extends WorkerPlugin {
    @MessageHandler(EndGameMessage, { override: true })
    async onEndGameMessage(message: EndGameMessage, { sender }: PacketContext, originalListeners: MessageHandlerCallback<EndGameMessage>[]) {
        await sender.room?.handleEnd(GameOverReason.ImpostorByKill); // always let impostors win due to killing all of the crewmates
        this.logger.info("Ended game!!");
    }
}
```

> Check out {@link MessageHandlerOptions} for a list of more options.

This will clear any other previously attached listeners before attaching, and provide you with those in the method via the additional `originalListeners` argument.

> Note that this will also override any listeners from other plugins; including those that were overrides themselves. If you want to make sure that yours reigns supreme and is not overriden, make sure your {@page ../load-ordering.md plugin load ordering} is on "last". To be curteous to those plugins, however, please call them using the `originalListeners` argument.

### `originalListeners`
An array containing every other previous listener before they were overriden by your method.

Rather annoyingly, due to a [long standing issue with TypeScript](https://github.com/Microsoft/TypeScript#4881), you will have to annotate the parameter with a long type: `originalListeners: MessageHandlerCallback<YourMessage>[]`.

## Calling Original Overriden Listeners
One reason you may want to have access to the original listeners of the message may be so you can modify the message, similar to a hook. This can be done fairly simply by looping through the array and calling each listener manually:

```ts
@HindenburgPlugin("hbplugin-fun-things")
export class FunThingsPlugin extends WorkerPlugin {
    @MessageHandler(EndGameMessage, { override: true })
    async onEndGameMessage(message: EndGameMessage, ctx: PacketContext, originalListeners: MessageHandlerCallback<EndGameMessage>[]) {
        await ctx.sender.room?.destroy();

        const altered = new EndGameMessage(
            message.code,
            GameOverReason.ImpostorByKill, // always show that impostors won due to killing all of the crewmates
            false
        );

        for (const listener of originalListeners) {
            listener(altered, ctx);
        }
    }
}
```

If you want to call each listener sequentially, waiting for each to finish before running the next, simply `await`:
```ts
for (const listener of originalListeners) {
    await listener(altered, ctx);
}
```
