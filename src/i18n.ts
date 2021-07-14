export default {
    "havent_received_all_mods": {
        "en_US": "The server failed to receive all of your mods, please try again"
    },
    "reactor_required_on_server": {
        "en_US": "This server requires you to have Reactor, see https://reactor.gg for more information"
    },
    "reactor_not_enabled_on_server": {
        "en_US": "Reactor is not enabled on this server, please disable it"
    },
    "mod_banned_on_server": {
        // %1 = ID of mod that is banned
        "en_US": "Mod banned on server: %1"
    },
    "reactor_required_for_room": {
        "en_US": "This room requires you to have Reactor, see https://reactor.gg for more information"
    },
    "reactor_not_enabled_for_room": {
        "en_US": "Reactor is not enabled for this room, please disable it"
    },
    "missing_required_mod": {
        // %1 = ID of mod that is required
        // %2 = Version of the mod that is required
        "en_US": "Missing required mod: %1 (%2)"
    },
    "bad_mod_version": {
        // %1 = ID of mod that has a bad version
        // %2 = The version of the mod that the client has
        // %3 = The version of the mod that the client needs
        "en_US": "Bad mod version for %1: %2, needs %3"
    },
    "mod_not_recognised": {
        // %1 = The ID of the mod that is not allowed
        "en_US": "Unknown mod not allowed: %1"
    }
} as const;