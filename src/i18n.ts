// Spanish translations: Songaku
// Portuguese translations: Matador
// French translations: DumbPlayer2

export default {
    "havent_received_all_mods": {
        "en_US": "The server failed to receive all of your mods, please try again",
        "pt_BR": "O servidor não conseguiu receber todos os seus mods, por favor tente novamente",
        "fr": "Le serveur n'a pas réussi à recevoir tous vos mods, veuillez réessayer",
        "es_ES": "El servidor no ha conseguido recibir todos sus mods, por favor, intentelo de nuevo",
        "de:": "Der Server scheiterte alle Ihrer Mods zu empfangen, bitte versuchen Sie erneut",
        "sv-SE": "Servern fick inte alla av dina moddar, försök igen"
    },
    "reactor_required_on_server": {
        "en_US": "This server requires you to have Reactor, see https://reactor.gg/ for more information",
        "pt_BR": "Este servidor requer que você tenha o Reactor, veja https://reactor.gg/ para mais informações",
        "fr": "Ce serveur nécessite que vous ayez Reactor, voir https://reactor.gg/ pour plus d'informations",
        "es_ES": "Este servidor requiere que tengas Reactor, entra en https://reactor.gg/ para más información",
        "de": "Dieser Server benötigt Reactor, siehe https://reactor.gg/ für weitere Informationen",
        "sv-SE": "Den här servern kräver att du har Reactor, se https://reactor.gg/ för mer information"
    },
    "reactor_not_enabled_on_server": {
        "en_US": "Reactor is not enabled on this server, please disable it",
        "pt_BR": "O Reactor não está habilitado neste servidor, por favor desabilite-o",
        "fr": "Reactor n'est pas activé sur ce serveur, veuillez le désactiver",
        "es_ES": "Reactor no está habilitado en este servidor, por favor, deshabilitelo",
        "de": "Reactor ist für diesen Server nicht aktiviert, deaktivieren Sie es bitte",
        "sv-SE": "Reactor är inte aktiverat på den här servern, stäng av det"
    },
    "mod_banned_on_server": {
        // %1 = ID of mod that is banned
        "en_US": "Mod banned on server: %1",
        "pt_BR": "Mod banido neste servidor: %1",
        "fr": "Mod interdit sur le serveur : %1",
        "es_ES": "Mod baneado de este servidor: %1",
        "de": "Mod ist auf diesen Server gebannt: %1",
        "sv-SE": "Mod bannad från server: %1"
    },
    "reactor_required_for_room": {
        "en_US": "This room requires you to have Reactor, see https://reactor.gg/ for more information",
        "pt_BR": "Está sala requer que você tenha o Reactor, veja https://reactor.gg/ para mais informações",
        "fr": "Cette salle nécessite que vous ayez Reactor, voir https://reactor.gg/ pour plus d'informations",
        "es_ES": "Esta sala requiere que tengas Reactor, entra en https://reactor.gg/ para más información",
        "de": "Dieser Raum benötigt Reactor, siehe https://reactor.gg/ für weitere Informationen",
        "sv-SE": "Detta rum kräver att du har Reactor, se https://reactor.gg/ för mer information"
    },
    "reactor_not_enabled_for_room": {
        "en_US": "Reactor is not enabled for this room, please disable it",
        "pt_BR": "O Reactor não está habilitado nesta sala, por favor desabilite-o",
        "fr": "Reactor n'est pas activé pour cette salle, veuillez le désactiver",
        "es_ES": "Reactor no está habilitado en esta sala, por favor, deshabilitelo",
        "de": "Reactor ist für diesen Raum nicht aktiviert, deaktivieren Sie es bitte",
        "sv-SE": "Reactor är inte aktiverat för detta rum, stäng av det"
    },
    "missing_required_mod": {
        // %1 = ID of mod that is required
        // %2 = Version of the mod that is required
        "en_US": "Missing required mod: %1 (%2)",
        "pt_BR": "Mod necessário faltando: %1 (%2)",
        "fr": "Mod requis manquant : %1 (%2)",
        "es_ES": "Mod requerido faltante: %1 (%2)",
        "de": "Fehlende benötigte Mod: %1 (%2)",
        "sv-SE": "Saknar mod: %1 (%2)"
    },
    "bad_mod_version": {
        // %1 = ID of mod that has a bad version
        // %2 = The version of the mod that the client has
        // %3 = The version of the mod that the client needs
        "en_US": "Bad mod version for %1: %2, needs %3",
        "pt_BR": "Versão do mod ruim para %1: v%2, precisa v%3",
        "fr": "Mauvaise version du mod pour %1 : %2, nécessite %3",
        "es_ES": "Versión incorrecta para %1: %2, necesita %3",
        "de": "Schlechte Mod Version für %1: %2, benötigt %3",
        "sv-SE": "Dålig version för mod %1: %2, behöver %3"
    },
    "mod_not_recognised": {
        // %1 = ID of the mod that is not allowed
        "en_US": "Unknown mod not allowed: %1",
        "pt_BR": "Mod desconhecido não permitido: %1",
        "fr": "Mod inconnu non autorisé : %1",
        "es_ES": "Mod desconocido no permitido: %1",
        "de": "Unbekannte Mod nicht erlaubt: %1",
        "sv-SE": "Okänd mod inte tillåten: %1"
    }
} as const;
