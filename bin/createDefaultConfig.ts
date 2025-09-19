import { Hat, Skin, Visor } from "@skeldjs/constant";
import { HindenburgConfig } from "../src";

export function createDefaultConfig(): HindenburgConfig {
    return {
        clusterName: "Capybara",
        nodeId: 0,
        checkForUpdates: true,
        autoUpdate: false,
        exitConfirmation: true,
        defaultLanguage: "en",
        acceptedVersions: ["2025.7.15"],
        matchmaker: {
            port: 22021
        },
        socket: {
            port: 22023,
            additionalPorts: [],
            acceptUnknownGameData: false,
            messageOrdering: false,
            ip: "auto",
            useDtlsLayout: false
        },
        gameListing: {
            ignorePrivacy: false,
            ignoreSearchTerms: false,
            maxResults: 10,
            requirePefectMatches: false
        },
        plugins: {
            loadDirectory: true
        },
        anticheat: {
            penalty: {
                action: "disconnect",
                strikes: 2,
                banAfterXDisconnects: 3,
                banDuration: 3600,
                disconnectMessage: "You have been banned for $duration."
            },
            rules: {}
        },
        logging: {
            hideSensitiveInfo: false,
            connections: {
                format: ["id", "ip", "ping", "room"]
            },
            rooms: {
                format: ["players", "map", "issaah", "privacy"]
            },
            players: {
                format: ["id", "ping", "ishost"]
            }
        },
        rooms: {
            checkChatMode: false,
            chatCommands: true,
            plugins: {
                loadDirectory: true
            },
            gameCodes: "v2",
            enforceSettings: {},
            serverAsHost: false,
            advanced: {
                unknownObjects: false
            },
            serverPlayer: {
                name: "<color=yellow>[Server]</color>",
                color: "Yellow",
                hat: Hat.NoHat,
                skin: Skin.None,
                visor: Visor.EmptyVisor
            },
            createTimeout: 10
        },
        optimizations: {
            movement: {
                reuseBuffer: true,
                updateRate: 1,
                visionChecks: false,
                deadChecks: true
            },
            disablePerspectives: false
        }
    };
}
