export default {
    "havent_received_all_mods": {
        "en_US": "The server failed to receive all of your mods, please try again",
        "pt_BR": "O servidor não conseguiu receber todos os seus mods, por favor tente novamente",
        "fr_FR": "Le serveur n'a pas réussi à recevoir tous vos mods, veuillez réessayer",
        "sv_SE": "Servern fick inte alla av dina moddar, försök igen"
    },
    "reactor_required_on_server": {
        "en_US": "This server requires you to have Reactor, see https://reactor.gg/ for more information",
        "pt_BR": "Este servidor requer que você tenha o Reactor, veja https://reactor.gg/ para mais informações",
        "fr_FR": "Ce serveur nécessite que vous ayez Reactor, voir https://reactor.gg/ pour plus d'informations",
        "sv_SE": "Den här servern kräver att du har Reactor, se https://reactor.gg/ för mer information"
    },
    "reactor_not_enabled_on_server": {
        "en_US": "Reactor is not enabled on this server, please disable it",
        "pt_BR": "O Reactor não está habilitado neste servidor, por favor desabilite-o",
        "fr_FR": "Reactor n'est pas activé sur ce serveur, veuillez le désactiver",
        "sv_SE": "Reactor är inte aktiverat på den här servern, stäng av det"
    },
    "mod_banned_on_server": {
        // %1 = ID of mod that is banned
        "en_US": "Mod banned on server: %1",
        "pt_BR": "Mod banido neste servidor: %1",
        "fr_FR": "Mod interdit sur le serveur : %1",
        "sv_SE": "Mod bannad från server: %1"
    },
    "reactor_required_for_room": {
        "en_US": "This room requires you to have Reactor, see https://reactor.gg/ for more information",
        "pt_BR": "Está sala requer que você tenha o Reactor, veja https://reactor.gg/ para mais informações",
        "fr_FR": "Cette salle nécessite que vous ayez Reactor, voir https://reactor.gg/ pour plus d'informations",
        "sv_SE": "Detta rum kräver att du har Reactor, se https://reactor.gg/ för mer information"
    },
    "reactor_not_enabled_for_room": {
        "en_US": "Reactor is not enabled for this room, please disable it",
        "pt_BR": "O Reactor não está habilitado nesta sala, por favor desabilite-o",
        "fr_FR": "Reactor n'est pas activé pour cette salle, veuillez le désactiver",
        "sv_SE": "Reactor är inte aktiverat för detta rum, stäng av det"
    },
    "missing_required_mod": {
        // %1 = ID of mod that is required
        // %2 = Version of the mod that is required
        "en_US": "Missing required mod: %1 (%2)",
        "pt_BR": "Mod necessário faltando: %1 (%2)",
        "fr_FR": "Mod requis manquant : %1 (%2)",
        "sv_SE": "Saknar mod: %1 (%2)"
    },
    "bad_mod_version": {
        // %1 = ID of mod that has a bad version
        // %2 = The version of the mod that the client has
        // %3 = The version of the mod that the client needs
        "en_US": "Bad mod version for %1: %2, needs %3",
        "pt_BR": "Versão do mod ruim para %1: v%2, precisa v%3",
        "fr_FR": "Mauvaise version du mod pour %1 : %2, nécessite %3",
        "sv_SE": "Dålig version för mod %1: %2, behöver %3"
    },
    "mod_not_recognised": {
        // %1 = ID of the mod that is not allowed
        "en_US": "Unknown mod not allowed: %1",
        "pt_BR": "Mod desconhecido não permitido: %1",
        "fr_FR": "Mod inconnu non autorisé : %1",
        "sv_SE": "Okänd mod inte tillåten: %1"
    }
} as const;
