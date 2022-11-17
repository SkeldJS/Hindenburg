End game intents are notifications to Hindenburg/the lobby that the game should end given some condition.

They're used instead of simply calling {@link BaseRoom.endGame} as you can pass metadata and are cancelable by listening for the {@link RoomEndGameIntentEvent | `room.endgameintent`} event.

Using them also prevents race conditions where two events end the game at the same time, thus throwing errors or causing issues for end clients.

If you're making your own gamemode, it'll be useful to create your own end game intents to specify when the game should end.

## Registering an end game intent
To register an end game intents means requesting for SkeldJS to end the game, which you can do so with the {@link BaseRoom.registerEndGameIntent} method.

For example, the {@link MeetingHud} uses:
```ts
this.room.registerEndGameIntent(
    new EndGameIntent(
        AmongUsEndGames.PlayersVoteOut,
        GameOverReason.HumansByVote,
        {}
    )
);
```

You can pass metadata into the end game intent constructor:
```ts
this.room.registerEndGameIntent(
    new EndGameIntent(
        "someone was blown up",
        GameOverReason.HumansByVote,
        {
            explodedPlayer: player
        }
    )
);
```

> Note that the {@link EndGameIntent.reason} must be a valid {@link GameOverReason}, otherwise Among Us will display everyone as being defeated. Check out the {@oage Custom End Game Screens} guide to be able to show any players as winners or losers.

## Canceling end game intents
As noted, end game intents are helpful to give other areas of your code or other plugins the opportunity to cancel your game end. This can be done through the {@link RoomEndGameIntentEvent | `room.endgameintent`} event:
```ts
@EventListener("room.endgameintent")
onEndGameIntent(ev: RoomEndGameIntentEvent<Room>) {
    ...

    ev.cancel();
}
```

For example, if you want to prevent the meeting from ending the game when an impostor is voted out:
```ts
@EventListener("room.endgameintent")
onEndGameIntent(ev: RoomEndGameIntent<Room>) {
    if (ev.intentName === AmongUsEndGames.PlayerVoteOut) {
        if (ev.metadata.aliveImpostors === 0) {
            ev.cancel();
        }
    }
}
```

> Note that the metadata in the event will be untyped, although you can cast with `const metadata = ev.metadata as MyMetadataType` to get types.

## Built-in end games
SkeldJS has some built-in end games that you can cancel:

| ID | Enum | Description | Metadata |
|----|------|-------------|----------|
| `o2 sabotage` | {@link AmongUsEndGames.O2Sabotage} | Registered when the oxygen/life support system timer reaches 0 after sabotage | `n/a` |
| `reactor sabotage`| {@link AmongUsEndGames.ReactorSabotage} | Registered when the reactor system timer reaches 0 after sabotage | `n/a` |
| `players disconnect` | {@link AmongUsEndGames.PlayersDisconnect} | Registered when a player disconnects and there aren't enough players on either side to continue the game | {@link PlayersDisconnectEndgameMetadata} |
| `players vote out` | {@link AmongUsEndGames.PlayersVoteOut} | Registered when a player is voted out and there aren't enough players on either side to continue the game | {@link PlayersVoteOutEndgameMetadata} |
| `players kill` | {@link AmongUsEndGames.PlayersKill} | Registered when a player is killed and there aren't enough players on either side to continue the game | {@link PlayersKillEndgameMetadata} |
| `tasks complete` | {@link AmongUsEndGames.TasksComplete} | Registered when the crewmates have completed all of their tasks | {@link TasksCompleteEndgameMetadata}
