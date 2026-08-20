import { Hat, Skin, Visor } from "@skeldjs/au-core";
import { WaterwayConfig } from "../src";

export function createDefaultConfig(): WaterwayConfig {
    return {
        clusterName: "Capybara",
        nodeId: 0,
        checkForUpdates: true,
        autoUpdate: false,
        exitConfirmation: true,
        defaultLanguage: "en",
        acceptedVersions: [
            "2025.7.15",  // 17.0.0 (2025-09-09)
            "2025.9.12",  // 17.0.1 (2025-10-14)
            "2025.10.9",  // 17.1   (2025-11-18)
            "2025.11.6",  // 17.1.1 (2025-12-03, mobile only)
            "2025.12.8",  // 17.1.2 (2025-12-11, mobile only)
            "2025.11.5",  // 17.2   (2026-02-17, build 6630)
            "2026.1.22",  // 17.2   (2026-02-19, build 6686, hotfix)
            "2026.2.2",   // 17.2.2 (2026-03-17, build 6768)
            "2026.1.12",  // 17.3   (2026-03-31, build 6803)
            "2026.3.17",  // 17.3.1 (2026-04-08, build 6841, mobile only)
            "2026.3.18",  // 17.4   (2026-06-05, build 7044, pc only)
            "2026.4.23",  // 17.4   (2026-06-05, build 7045, mobile only)
        ],
        matchmaker: {
            port: 22023
        },
        socket: {
            port: 22123,
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
            removeExtraFilters: false,
            requireExactMatches: true,
            filterTags: []
        },
        plugins: {
            loadDirectory: true
        },
        logging: {
            hideSensitiveInfo: false,
            playerColors: true,
            connections: {
                format: ["id", "ip", "ping", "room"]
            },
            rooms: {
                format: ["players", "map", "host", "privacy"]
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
            allowedGameModes: [],
            defaultGameMode: 1,
            authoritativeServer: false,
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
