Server-as-a-Host (**SaaH**) in Hindenburg allows you to have ultimate control and bypassing the middle man of having a host, as it is on officials. This doesn't mean that there are no hosts to change settings or to start the game, actually, SaaH allows you to have multiple hosts at once.

## Performance
As SaaH doesn't analyse or process any more that Hindenburg normally does for hosted games, it should result in almost identical performance as if it were disabled.

However, there should be a just-barely noticeable difference in high-ping scenarios, as it means that any packets made to the host (such as system sabotages) can instead be done on the server.

## Multiple Hosts
The technology used for SaaH allows for you to have multiple hosts in the same room. This is because SaaH creates hosts known as "acting hosts" — players that are only hosts in the lobby, where their host state is removed while a player is joining and while a game is being played.

This also works when SaaH is disabled — meaning that there is one "actual" host and none or several "acting" hosts.

![image](https://user-images.githubusercontent.com/60631511/170726121-a03df946-55bc-4529-aee8-69a4124a91b5.png)

## Command-Line
You can enable/disable SaaH with the `setsaah <room code> <on/off>` command:

![](https://i.imgur.com/Z3YZtBz.gif)

## Configuration
You can enable/disable Server-as-a-Host either in the interactive setup script, or set the `rooms.serverAsHost` config option:

```
"rooms": {
    "serverAsHost": true
}
```
