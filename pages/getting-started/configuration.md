Hindenburg has an easy-to-use JSON file for configuring the whole server. Hindenburg will look for a config.json in the current working directory, or if the `HINDENBURG_CONFIGS` environment variable is set to an absolute filename of the config.json to use, check out the [Environment Variables](./Environment%20Variables) page for more information.

## CLI Arguments
Hindenburg also accepts configuration values as CLI arguments to the start command, either `yarn dev` or `yarn start`.

You can use any of the config keys below preceded with two dashes (`--`) to change the config at runtime.

For eaxmple, you could start Hindenburg with:
```sh
yarn start --socket.port 22023 --reactor.mods["daemon.unify"].optional false
```

_This is equivalent to the following `config.json`_
```json
{
    "socket": {
        "port": 22023
    },
    "reactor": {
        "mods": {
            "daemon.unify": {
                "optional": false
            }
        }
    }
}
```

Some configuration keys with a wildcard, such as `reactor.mods.*` require a special accessing syntax. As seen in the example, this is simply `["key"]`, where the key is instead separated by square brackets and quotation marks. You should also omit the period (`.`) preceding it.

# Configuration Values
## extends

Relative or absolute path to another Hindenburg config to base this one off, to extend all values from.

**Type**: string

**Default**: `(none)`



_or_


Relative or absolute path to other Hindenburg configs to base this one off, to extend all values from.

**Type**: array

### **extends[]**
Relative or absolute path to another Hindenburg config to base this one off, to extend all values from.

**Type**: string



## clusterName
The name of the cluster that this node belongs to.

**Type**: string

**Default**: `"Capybara"`

## nodeId
The ID of this node in relation to other nodes in the cluster.

**Type**: number

## checkForUpdates
Whether or not to check for updates.

**Type**: boolean

**Default**: `true`

## autoUpdate
Whether or not to auto-update Hindenburg when there is an update available.

**Type**: boolean

## exitConfirmation
Whether or not to confirm when pressing CTRL+C to close Hindenburg.

**Type**: boolean

**Default**: `true`

## defaultLanuage
Default language to localise disconnect messages to.

**Type**: string

**Default**: `"en"`

Any of the following: `"de"`, `"en"`, `"es_ES"`, `"es_US"`, `"fil"`, `"fr"`, `"ga"`, `"it"`, `"ja"`, `"ko"`, `"nl"`, `"pt"`, `"pt_BR"`, `"ru"`, `"zh"`

## acceptedVersions
Accepted game versions that clients can connect with.

**Type**: array

### **acceptedVersions[]**
**Type**: string

## matchmaker
Configuration for the included Hindenburg http matchmaker.

**Type**: object

### **matchmaker.port**
The port that the matchmaker should listen on.

**Type**: number

**Default**: `22021`

## socket
Options regarding the socket that the server listens on.

**Type**: object

### **socket.port**
The port to listen on.

**Type**: number

**Default**: `22023`

### **socket.additionalPorts**
Any additional ports for Hindenburg to listen on.

**Type**: array

#### **socket.additionalPorts[]**
**Type**: number

### **socket.broadcastUnknownGamedata**
Whether or not to broadcast gamedata messages that don't get handled by the server.

**Type**: boolean

### **socket.messageOrdering**
Whether to order reliable packets received from clients.

**Type**: boolean

### **socket.ip**
The IP address of this node, set to `auto` for it to get auto-discovered.

**Type**: string

**Default**: `"auto"`

### **socket.useDtlsLayout**
Whether or not to use the DTLS transport layout when listening for Hello packets.

**Type**: boolean

## gameListing
Options regarding fine-tuning the results of game listings.

**Type**: object

### **gameListing.ignorePrivacy**
Whether to ignore the privacy of a room, and return even private ones.

**Type**: boolean

### **gameListing.ignoreSearchTerms**

Whether to ignore filtering for game listings, and just list every game on the server.

**Type**: boolean



_or_


Which search terms to ignore

**Type**: array

#### **gameListing.ignoreSearchTerms[]**
Any of the following: `"chat"`, `"chatType"`, `"impostors"`, `"map"`



### **gameListing.maxResults**

**Type**: number



_or_


**Type**: string

Any of the following: `"all"`



### **gameListing.requirePerfectMatches**
Whether to only return results that are a perfect match to all of the sort terms. Otherwise, Hindenburg will sort results by relevance to the search terms.

**Type**: boolean

## plugins
Options regarding global worker plugins, such as disabling them or passing configuration options.

**Type**: object

### **plugins.loadDirectory**
Whether to load all plugins found in the plugin directories.

**Type**: boolean

**Default**: `true`

### **plugins.\***

Whether to enable or disable this plugin.

**Type**: boolean



_or_


Enable the plugin and pass any configuration values to it.

**Type**: object



## anticheat
Advanced options for HACS, Hindenburg's Anti-Cheat System.

**Type**: object

### **anticheat.penalty**
The penalty to give a player for breaking this rule.

**Type**: object

#### **anticheat.penalty.action**
The action that should be applied on this user for breaking this rule.

**Type**: string

Any of the following: `"ban"`, `"disconnect"`, `"ignore"`

#### **anticheat.penalty.strikes**
The number of strikes that this user has before they are penalised.

**Type**: number

#### **anticheat.penalty.banAfterXDisconnects**
The number of general disconnects the player should have to have had for breaking this rule until they are banned.

**Type**: number

#### **anticheat.penalty.banDuration**
The length, in seconds, of how long to ban a player for breaking this rule.

**Type**: number

#### **anticheat.penalty.disconnectMessage**
The message to give this player when disconnecting or banning this player.

**Type**: string

### **anticheat.rules**
Configuration for each individual sub-rule.

#### **anticheat.rules.\***
**Type**: boolean, number or object

##### **anticheat.rules.\*.\***
**Type**: array, boolean, number, object or string

## logging
Options for logging.

**Type**: object

### **logging.hideSensitiveInfo**
Whether to hide sensitive information from logging, such as ip addresses.

**Type**: boolean

### **logging.connections**
Logging options for client connections.

**Type**: object

#### **logging.connections.format**
Custom formatting for the extra information provided when logging client connections. (The part in parenthesis after their username.)

**Type**: array

**Default**: `[ "id", "ip", "ping", "room" ]`

##### **logging.connections.format[]**
**Type**: string

Any of the following: `"id"`, `"ip"`, `"language"`, `"level"`, `"mods"`, `"ping"`, `"platform"`, `"room"`, `"version"`

### **logging.rooms**
Logging options for game rooms.

**Type**: object

#### **logging.rooms.format**
Custom formatting for the extra information provided when rooms are logged. (The part in parenthesis after the game code.)

**Type**: array

**Default**: `[ "players", "map", "issaah", "privacy" ]`

##### **logging.rooms.format[]**
**Type**: string

Any of the following: `"issaah"`, `"map"`, `"players"`, `"privacy"`

### **logging.players**
Logging options for logging players in-game.

**Type**: object

#### **logging.players.format**
Custom formatting for the extra information provided when players are logged. (The part in parenthesis after the player's name.)

**Type**: array

**Default**: `[ "id", "ping", "ishost" ]`

##### **logging.players.format[]**
**Type**: string

Any of the following: `"id"`, `"ishost"`, `"language"`, `"level"`, `"mods"`, `"ping"`, `"platform"`

## reactor

**Type**: boolean



_or_


**Type**: object

### **reactor.blockClientSideOnly**
Whether to block reactor RPCs from mods that are declared as being client-side-only.

**Type**: boolean

**Default**: `true`

### **reactor.mods**
Individual configuration for each mod in regards to how Hindenburg should treat them.

**Type**: object

#### **reactor.mods.\***

**Type**: boolean



_or_


**Type**: object

##### **reactor.mods.\*.optional**
Whether this mod is optional, and clients can connect without it.

**Type**: boolean

##### **reactor.mods.\*.banned**
Whether clients with this mod cannot connect.

**Type**: boolean

##### **reactor.mods.\*.version**
Enforce a specific version glob for this mod.

**Type**: string

**Default**: `"*"`

##### **reactor.mods.\*.doNetworking**
Whether to broadcast messages sent by this mod.

**Type**: boolean

**Default**: `true`



### **reactor.allowExtraMods**
Whether to allow extra mods aside from those in 'mods' which would still be used to enforce certain version of mods, and to require certain mods.

**Type**: boolean

**Default**: `true`

### **reactor.allowNormalClients**
Whether to allow normal clients to connect.

**Type**: boolean

### **reactor.requireHostMods**
Whether or not to require joining clients to have the same mods as the host.

**Type**: boolean

**Default**: `true`



## rooms
**Type**: object

### **rooms.checkChatMode**
Whether or not to make sure players have the same chat mode as the host before joining.

**Type**: boolean

### **rooms.chatCommands**

**Type**: boolean



_or_


**Type**: object

#### **rooms.chatCommands.prefix**
The prefix (or command identifier) for commands.

**Type**: string

**Default**: `"/"`

#### **rooms.chatCommands.helpCommand**
Whether or not rooms can use the built-in help command.

**Type**: boolean

**Default**: `true`



### **rooms.gameCodes**
The type of game code to generate for rooms, "v1" for a 4-letter code and "v2" for a 6-letter code.

**Type**: string

**Default**: `"v2"`

Any of the following: `"v1"`, `"v2"`

### **rooms.enforceSettings**
Enforce certain settings, preventing the host from changing them.

**Type**: object

**Default**: `{}`

#### **rooms.enforceSettings.maxPlayers**
**Type**: number

#### **rooms.enforceSettings.keywords**
**Type**: string

Any of the following: `"All"`, `"Arabic"`, `"ChineseSimplified"`, `"ChineseTraditional"`, `"Dutch"`, `"English"`, `"Filipino"`, `"French"`, `"German"`, `"Irish"`, `"Italian"`, `"Japanese"`, `"Korean"`, `"Other"`, `"Polish"`, `"Portuguese"`, `"PortugueseBrazil"`, `"Russian"`, `"Spanish"`, `"SpanishAmericas"`

#### **rooms.enforceSettings.map**
**Type**: string

Any of the following: `"Airship"`, `"Mira HQ"`, `"Polus"`, `"The Skeld"`, `"The Skeld April Fools"`

#### **rooms.enforceSettings.playerSpeed**
**Type**: number

#### **rooms.enforceSettings.crewmateVision**
**Type**: number

#### **rooms.enforceSettings.impostorVision**
**Type**: number

#### **rooms.enforceSettings.killCooldown**
**Type**: number

#### **rooms.enforceSettings.commonTasks**
**Type**: number

#### **rooms.enforceSettings.longTasks**
**Type**: number

#### **rooms.enforceSettings.shortTasks**
**Type**: number

#### **rooms.enforceSettings.numEmergencies**
**Type**: number

#### **rooms.enforceSettings.numImpostors**
**Type**: number

#### **rooms.enforceSettings.killDistance**
**Type**: string

Any of the following: `"Long"`, `"Medium"`, `"Short"`

#### **rooms.enforceSettings.discussionTime**
**Type**: number

#### **rooms.enforceSettings.votingTime**
**Type**: number

#### **rooms.enforceSettings.isDefaults**
**Type**: number

#### **rooms.enforceSettings.emergencyCooldown**
**Type**: number

#### **rooms.enforceSettings.confirmEjects**
**Type**: number

#### **rooms.enforceSettings.visualTasks**
**Type**: number

#### **rooms.enforceSettings.anonymousVotes**
**Type**: number

#### **rooms.enforceSettings.taskbarUpdates**
**Type**: string

Any of the following: `"Always"`, `"Meetings"`, `"Never"`

### **rooms.plugins**
Options regarding local room plugins, such as disabling them or passing configuration options.

**Type**: object

#### **rooms.plugins.loadDirectory**
Whether to load all plugins in the plugin directory.

**Type**: boolean

**Default**: `true`

#### **rooms.plugins.\***

Whether to enable or disable this plugin.

**Type**: boolean



_or_


Enable the plugin, and also pass in any configuration options that the plugin accepts.

**Type**: object



### **rooms.serverAsHost**
Whether the server should act as the host of the room.

**Type**: boolean

### **rooms.advanced**
Advanced room options for mod and plugin developers, or knowledgeable server owners.

**Type**: object

#### **rooms.advanced.unknownObjects**

Ignore _every_ object type and treat all of them as uknown, including standard Among Us objects.

**Type**: string

Any of the following: `"all"`



_or_


Whether or not to allow uknown object types.

**Type**: boolean



_or_


An array of either spawn IDs or spawn types to allow

**Type**: array

##### **rooms.advanced.unknownObjects[]**

**Type**: string



_or_


**Type**: number





### **rooms.serverPlayer**
Default appearance for a message sent by the server in game chat.

**Type**: object

#### **rooms.serverPlayer.name**
The name of the player for a message sent by the server in game chat.

**Type**: string

**Default**: `"<color=yellow>[Server]</color>"`

#### **rooms.serverPlayer.color**
The color of the player for a message sent by the server in game chat.

**Type**: string

**Default**: `"Yellow"`

#### **rooms.serverPlayer.hat**
The hat of the player for a message sent by the server in game chat.

**Type**: string

**Default**: `(none)`

#### **rooms.serverPlayer.skin**
The skin of the player for a message sent by the server in game chat

**Type**: string

**Default**: `(none)`

#### **rooms.serverPlayer.visor**
The visor of the player for a message sent by the server in game chat

**Type**: string

**Default**: `(none)`

### **rooms.createTimeout**
The timeout in seconds to wait for a player joins before considering the room empty and destroying it.

**Type**: number

**Default**: `10`

## optimizations
**Type**: object

### **optimizations.movement**
**Type**: object

#### **optimizations.movement.reuseBuffer**
Whether or not to re-use the buffer to send to every client, instead of re-constructing the packet each time.

**Type**: boolean

**Default**: `true`

#### **optimizations.movement.updateRate**
How often to actually broadcast movement packets from a single player, should be a very low number, between 1 and 3, where 1 is the most frequent (every packet is broadcasted) and 3 is the least frequent.

**Type**: number

**Default**: `1`

#### **optimizations.movement.visionChecks**
Whether or not to check whether or not the player receiving each movement packet is in the vision of the player that moved, so-as to only send movement packets to those who can see it.

**Type**: boolean

#### **optimizations.movement.deadChecks**
Whether or not to check whether the sender and the reciever are dead so as to not send movement packets from alive players to dead players.

**Type**: boolean

**Default**: `true`

### **optimizations.disablePerspectives**
Whether or not to completely disable the perspective API for Hindenburg.

**Type**: boolean

