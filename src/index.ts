/**
 * @module @skeldjs/waterway
 */

export * from "./api";
export * from "./components";
export * from "./handlers";

export * from "./Connection";
export * from "./Logger";
export * from "./Matchmaker";
export * from "./Room";
export * from "./WaterwayServer";

export * from "./i18n";

export * from "@skeldjs/au-protocol";
export * from "@skeldjs/hazel";

// Re-export from @skeldjs/au-core explicitly to avoid ambiguity
// with Waterway's own Player* events (PlayerLevelChangedEvent, etc.)
export type { Player, PlayerControl, NetworkedPlayerInfo, MeetingHud, NetworkedObject } from "@skeldjs/au-core";
export type { PlayerJoinEvent, PlayerResolvable, PlayerSceneChangeEvent } from "@skeldjs/au-core";
export type { PlayerSetAuthoritativeEvent, RoomEndGameIntentEvent, RoomFixedUpdateEvent } from "@skeldjs/au-core";
export type { StatefulRoom, StatefulRoomEvents } from "@skeldjs/au-core";

export {
    AlterGameTag,
    Color,
    colorData,
    CustomNetworkTransform,
    DataState,
    DisconnectReason,
    EndGameIntent,
    GameDataMessageTag,
    GameMap,
    GameMode,
    GameOverReason,
    GameState,
    Hat,
    KillDistance,
    Language,
    Platform,
    QuickChatMode,
    RoleType,
    RoleTeamType,
    RpcMessageTag,
    SendOption,
    Skin,
    SpawnFlag,
    SpawnType,
    SpecialOwnerId,
    SystemType,
    TaskBarMode,
    Visor,
} from "@skeldjs/au-core";
