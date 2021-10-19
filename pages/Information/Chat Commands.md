Hindenburg has native support for simple chat commands for players to use to communicate with plugins. It comes with a premade help command (that can be disabled with the config). You can even configure how a message from the server appears in the chat.

```json
{
  "rooms": {
    "serverPlayer": {
      "name": "<color=blue>[Hindenburg]</color>",
      "color": "Blue",
      "hat": "Horns",
      "skin": "Archaeologist"
    }
  }
}
```

![image](https://user-images.githubusercontent.com/60631511/137989850-c7261d79-f1b4-47c1-bea6-078d7d59bc1d.png)

```json
{
  "rooms": {
    "serverPlayer": {
      "name": "<color=black>pog server</color>",
      "color": "White",
      "hat": "SafariHat",
      "skin": "Archaeologist"
    }
  }
}
```
![image](https://user-images.githubusercontent.com/60631511/137990195-7848819b-0967-4e66-a25a-24a375bd6bd1.png)

### Chat Commands and Plugins
Hindenburg provides a great and simple API for registering chat commands as a plugin, [check out the guide on registering custom chat commands for more information](/Plugins/Chat%20Commands).
