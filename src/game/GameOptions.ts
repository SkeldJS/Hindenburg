import {
    AllGameSettings,
    AllRoleSettings,
    GameSettings,
    RoleSettings
} from "@skeldjs/au-protocol";

import {
    GameMap,
    GameKeyword,
    GameMode,
    KillDistance,
    RoleType,
    RulesPreset,
    SpecialGameModes,
    TaskBarMode,
} from "@skeldjs/au-core";

/**
 * Result of validating game options. An empty errors array means valid.
 */
export interface ValidationResult {
    valid: boolean;
    errors: string[];
}

/**
 * Valid ranges for numeric game options.
 */
export const GAME_OPTION_RANGES = {
    playerSpeed:             { min: 0.5, max: 3.0 },
    crewmateVision:          { min: 0.0, max: 5.0 },
    impostorVision:          { min: 0.0, max: 5.0 },
    killCooldown:            { min: 2.5, max: 60.0 },
    commonTasks:             { min: 0, max: 4 },
    longTasks:               { min: 0, max: 15 },
    shortTasks:              { min: 0, max: 23 },
    numEmergencies:          { min: 0, max: 10 },
    numImpostors:            { min: 1, max: 3 },
    maxPlayers:              { min: 4, max: 15 },
    discussionTime:          { min: 0, max: 300 },
    votingTime:              { min: 0, max: 300 },
    emergencyCooldown:       { min: 0, max: 60 },
    crewmateVentUses:        { min: 0, max: 30 },
    hidingTime:              { min: 10, max: 600 },
    crewmateFlashlightSize:  { min: 0.0, max: 5.0 },
    impostorFlashlightSize:  { min: 0.0, max: 5.0 },
    finalHideTime:           { min: 0, max: 300 },
    finalSeekerSpeed:        { min: 0.5, max: 3.0 },
    maxPingTime:             { min: 0, max: 30 },
    crewmateTimeInVent:      { min: 0, max: 60 },
} as const;

/**
 * Valid ranges for role-specific settings.
 */
export const ROLE_OPTION_RANGES: Record<string, { min: number; max: number }> = {
    scientistCooldown:                 { min: 5, max: 60 },
    scientistBatteryCharge:            { min: 5, max: 30 },
    engineerCooldown:                  { min: 5, max: 60 },
    engineerInVentMaxTime:             { min: 0, max: 60 },
    guardianAngelCooldown:             { min: 35, max: 120 },
    guardianAngelPotectionDuration:    { min: 5, max: 30 },
    shapeshifterCooldown:              { min: 5, max: 60 },
    shapeshiftDuration:                { min: 5, max: 30 },
    noisemakerAlertDuration:           { min: 1, max: 30 },
    phantomCooldown:                   { min: 5, max: 60 },
    phantomDuration:                   { min: 5, max: 60 },
    trackerCooldown:                   { min: 5, max: 60 },
    trackerDuration:                   { min: 5, max: 60 },
    trackerDelay:                      { min: 1, max: 10 },
    detectiveSuspectLimit:             { min: 1, max: 10 },
    viperDissolveTime:                 { min: 5, max: 60 },
};

/**
 * Maximum number of players that can have a given role.
 */
const MAX_ROLE_PLAYERS = 15;

/**
 * All valid game map values.
 */
const VALID_GAME_MAPS: GameMap[] = [
    GameMap.TheSkeld,
    GameMap.MiraHQ,
    GameMap.Polus,
    GameMap.AprilFoolsTheSkeld,
    GameMap.Airship,
    GameMap.Fungle,
];

/**
 * All valid kill distance values.
 */
const VALID_KILL_DISTANCES: KillDistance[] = [
    KillDistance.Short,
    KillDistance.Medium,
    KillDistance.Long,
];

/**
 * All valid task bar update modes.
 */
const VALID_TASKBAR_MODES: TaskBarMode[] = [
    TaskBarMode.Normal,
    TaskBarMode.MeetingOnly,
    TaskBarMode.Invisible,
];

/**
 * All valid game modes.
 */
const VALID_GAME_MODES: GameMode[] = [
    GameMode.None,
    GameMode.Normal,
    GameMode.HideNSeek,
    GameMode.NormalFools,
    GameMode.HideNSeekFools,
];

/**
 * All valid special game modes.
 */
const VALID_SPECIAL_MODES: SpecialGameModes[] = [
    SpecialGameModes.None,
    SpecialGameModes.AprilFools,
];

/**
 * All valid rules presets.
 */
const VALID_RULES_PRESETS: RulesPreset[] = [
    RulesPreset.Custom,
    RulesPreset.Standard,
];

/**
 * Validator class for game options.
 *
 * Provides static methods to validate individual settings and full game settings objects.
 */
export class GameOptionsValidator {
    /**
     * Check if a numeric value is within a valid range.
     */
    static inRange(value: number, min: number, max: number): boolean {
        return value >= min && value <= max;
    }

    /**
     * Check if a value is a valid member of an enum-like set.
     */
    static inEnum<T extends string | number>(value: T, validValues: readonly T[]): boolean {
        return validValues.includes(value);
    }

    /**
     * Validate role chance settings (maxPlayers and chance percentages).
     */
    static validateRoleChances(roleSettings: AllRoleSettings): string[] {
        const errors: string[] = [];

        if (!roleSettings.roleChances) return errors;

        const roleChances = Object.entries(roleSettings.roleChances);
        for (const [roleTypeStr, roleChance] of roleChances) {
            const roleType = parseInt(roleTypeStr);

            if (isNaN(roleType) || !(roleType in RoleType)) {
                errors.push(`Invalid role type: ${roleTypeStr}`);
                continue;
            }

            if (roleChance.maxPlayers < 0 || roleChance.maxPlayers > MAX_ROLE_PLAYERS) {
                errors.push(
                    `${RoleType[roleType]}: maxPlayers (${roleChance.maxPlayers}) must be between 0 and ${MAX_ROLE_PLAYERS}`
                );
            }

            if (roleChance.chance < 0 || roleChance.chance > 100) {
                errors.push(
                    `${RoleType[roleType]}: chance (${roleChance.chance}) must be between 0 and 100`
                );
            }
        }

        return errors;
    }

    /**
     * Validate numeric role settings against defined ranges.
     */
    static validateRoleSettingRanges(roleSettings: AllRoleSettings): string[] {
        const errors: string[] = [];

        for (const [key, range] of Object.entries(ROLE_OPTION_RANGES)) {
            const value = (roleSettings as any)[key];
            if (value !== undefined && !this.inRange(value, range.min, range.max)) {
                errors.push(
                    `roleSettings.${key} (${value}) must be between ${range.min} and ${range.max}`
                );
            }
        }

        return errors;
    }

    /**
     * Validate all role settings.
     */
    static validateRoleSettings(roleSettings: AllRoleSettings): string[] {
        const errors: string[] = [];

        if (!roleSettings) return errors;

        errors.push(...this.validateRoleChances(roleSettings));
        errors.push(...this.validateRoleSettingRanges(roleSettings));

        return errors;
    }

    /**
     * Validate settings specific to Normal game mode.
     */
    static validateNormalModeSettings(settings: Partial<AllGameSettings>): string[] {
        const errors: string[] = [];

        if (settings.killCooldown !== undefined &&
            !this.inRange(settings.killCooldown, GAME_OPTION_RANGES.killCooldown.min, GAME_OPTION_RANGES.killCooldown.max)) {
            errors.push(
                `killCooldown (${settings.killCooldown}) must be between ${GAME_OPTION_RANGES.killCooldown.min} and ${GAME_OPTION_RANGES.killCooldown.max}`
            );
        }

        if (settings.numImpostors !== undefined &&
            !this.inRange(settings.numImpostors, GAME_OPTION_RANGES.numImpostors.min, GAME_OPTION_RANGES.numImpostors.max)) {
            errors.push(
                `numImpostors (${settings.numImpostors}) must be between ${GAME_OPTION_RANGES.numImpostors.min} and ${GAME_OPTION_RANGES.numImpostors.max}`
            );
        }

        if (settings.killDistance !== undefined &&
            !this.inEnum(settings.killDistance, VALID_KILL_DISTANCES)) {
            errors.push(`killDistance (${settings.killDistance}) is not a valid value`);
        }

        if (settings.discussionTime !== undefined &&
            !this.inRange(settings.discussionTime, GAME_OPTION_RANGES.discussionTime.min, GAME_OPTION_RANGES.discussionTime.max)) {
            errors.push(
                `discussionTime (${settings.discussionTime}) must be between 0 and 300`
            );
        }

        if (settings.votingTime !== undefined &&
            !this.inRange(settings.votingTime, GAME_OPTION_RANGES.votingTime.min, GAME_OPTION_RANGES.votingTime.max)) {
            errors.push(
                `votingTime (${settings.votingTime}) must be between 0 and 300`
            );
        }

        if (settings.emergencyCooldown !== undefined &&
            !this.inRange(settings.emergencyCooldown, GAME_OPTION_RANGES.emergencyCooldown.min, GAME_OPTION_RANGES.emergencyCooldown.max)) {
            errors.push(
                `emergencyCooldown (${settings.emergencyCooldown}) must be between 0 and 60`
            );
        }

        return errors;
    }

    /**
     * Validate settings specific to Hide and Seek game mode.
     */
    static validateHideAndSeekSettings(settings: Partial<AllGameSettings>): string[] {
        const errors: string[] = [];

        if (settings.crewmateVentUses !== undefined &&
            !this.inRange(settings.crewmateVentUses, GAME_OPTION_RANGES.crewmateVentUses.min, GAME_OPTION_RANGES.crewmateVentUses.max)) {
            errors.push(
                `crewmateVentUses (${settings.crewmateVentUses}) must be between ${GAME_OPTION_RANGES.crewmateVentUses.min} and ${GAME_OPTION_RANGES.crewmateVentUses.max}`
            );
        }

        if (settings.hidingTime !== undefined &&
            !this.inRange(settings.hidingTime, GAME_OPTION_RANGES.hidingTime.min, GAME_OPTION_RANGES.hidingTime.max)) {
            errors.push(
                `hidingTime (${settings.hidingTime}) must be between ${GAME_OPTION_RANGES.hidingTime.min} and ${GAME_OPTION_RANGES.hidingTime.max}`
            );
        }

        if (settings.crewmateFlashlightSize !== undefined &&
            !this.inRange(settings.crewmateFlashlightSize, GAME_OPTION_RANGES.crewmateFlashlightSize.min, GAME_OPTION_RANGES.crewmateFlashlightSize.max)) {
            errors.push(
                `crewmateFlashlightSize (${settings.crewmateFlashlightSize}) must be between 0.0 and 5.0`
            );
        }

        if (settings.impostorFlashlightSize !== undefined &&
            !this.inRange(settings.impostorFlashlightSize, GAME_OPTION_RANGES.impostorFlashlightSize.min, GAME_OPTION_RANGES.impostorFlashlightSize.max)) {
            errors.push(
                `impostorFlashlightSize (${settings.impostorFlashlightSize}) must be between 0.0 and 5.0`
            );
        }

        if (settings.finalHideTime !== undefined &&
            !this.inRange(settings.finalHideTime, GAME_OPTION_RANGES.finalHideTime.min, GAME_OPTION_RANGES.finalHideTime.max)) {
            errors.push(
                `finalHideTime (${settings.finalHideTime}) must be between 0 and 300`
            );
        }

        if (settings.finalSeekerSpeed !== undefined &&
            !this.inRange(settings.finalSeekerSpeed, GAME_OPTION_RANGES.finalSeekerSpeed.min, GAME_OPTION_RANGES.finalSeekerSpeed.max)) {
            errors.push(
                `finalSeekerSpeed (${settings.finalSeekerSpeed}) must be between 0.5 and 3.0`
            );
        }

        if (settings.maxPingTime !== undefined &&
            !this.inRange(settings.maxPingTime, GAME_OPTION_RANGES.maxPingTime.min, GAME_OPTION_RANGES.maxPingTime.max)) {
            errors.push(
                `maxPingTime (${settings.maxPingTime}) must be between 0 and 30`
            );
        }

        if (settings.crewmateTimeInVent !== undefined &&
            !this.inRange(settings.crewmateTimeInVent, GAME_OPTION_RANGES.crewmateTimeInVent.min, GAME_OPTION_RANGES.crewmateTimeInVent.max)) {
            errors.push(
                `crewmateTimeInVent (${settings.crewmateTimeInVent}) must be between 0 and 60`
            );
        }

        return errors;
    }

    /**
     * Validate common settings that apply to all game modes.
     */
    static validateCommonSettings(settings: Partial<AllGameSettings>): string[] {
        const errors: string[] = [];

        // Validate maxPlayers
        if (settings.maxPlayers !== undefined &&
            !this.inRange(settings.maxPlayers, GAME_OPTION_RANGES.maxPlayers.min, GAME_OPTION_RANGES.maxPlayers.max)) {
            errors.push(
                `maxPlayers (${settings.maxPlayers}) must be between ${GAME_OPTION_RANGES.maxPlayers.min} and ${GAME_OPTION_RANGES.maxPlayers.max}`
            );
        }

        // Validate map
        if (settings.map !== undefined && !this.inEnum(settings.map, VALID_GAME_MAPS)) {
            errors.push(`map (${settings.map}) is not a valid game map`);
        }

        // Validate player speed
        if (settings.playerSpeed !== undefined &&
            !this.inRange(settings.playerSpeed, GAME_OPTION_RANGES.playerSpeed.min, GAME_OPTION_RANGES.playerSpeed.max)) {
            errors.push(
                `playerSpeed (${settings.playerSpeed}) must be between ${GAME_OPTION_RANGES.playerSpeed.min} and ${GAME_OPTION_RANGES.playerSpeed.max}`
            );
        }

        // Validate vision ranges
        if (settings.crewmateVision !== undefined &&
            !this.inRange(settings.crewmateVision, GAME_OPTION_RANGES.crewmateVision.min, GAME_OPTION_RANGES.crewmateVision.max)) {
            errors.push(
                `crewmateVision (${settings.crewmateVision}) must be between 0.0 and 5.0`
            );
        }

        if (settings.impostorVision !== undefined &&
            !this.inRange(settings.impostorVision, GAME_OPTION_RANGES.impostorVision.min, GAME_OPTION_RANGES.impostorVision.max)) {
            errors.push(
                `impostorVision (${settings.impostorVision}) must be between 0.0 and 5.0`
            );
        }

        // Validate task counts
        if (settings.commonTasks !== undefined &&
            !this.inRange(settings.commonTasks, GAME_OPTION_RANGES.commonTasks.min, GAME_OPTION_RANGES.commonTasks.max)) {
            errors.push(
                `commonTasks (${settings.commonTasks}) must be between 0 and 4`
            );
        }

        if (settings.longTasks !== undefined &&
            !this.inRange(settings.longTasks, GAME_OPTION_RANGES.longTasks.min, GAME_OPTION_RANGES.longTasks.max)) {
            errors.push(
                `longTasks (${settings.longTasks}) must be between 0 and 15`
            );
        }

        if (settings.shortTasks !== undefined &&
            !this.inRange(settings.shortTasks, GAME_OPTION_RANGES.shortTasks.min, GAME_OPTION_RANGES.shortTasks.max)) {
            errors.push(
                `shortTasks (${settings.shortTasks}) must be between 0 and 23`
            );
        }

        // Validate numEmergencies
        if (settings.numEmergencies !== undefined &&
            !this.inRange(settings.numEmergencies, GAME_OPTION_RANGES.numEmergencies.min, GAME_OPTION_RANGES.numEmergencies.max)) {
            errors.push(
                `numEmergencies (${settings.numEmergencies}) must be between 0 and 10`
            );
        }

        // Validate dependency: numEmergencies should not exceed maxPlayers
        const maxPlayers = settings.maxPlayers ?? 10;
        const numEmergencies = settings.numEmergencies;
        if (numEmergencies !== undefined && maxPlayers !== undefined && numEmergencies > maxPlayers) {
            errors.push(
                `numEmergencies (${numEmergencies}) cannot exceed maxPlayers (${maxPlayers})`
            );
        }

        // Validate game mode (on the GameSettings object, not in AllGameSettings)
        if ((settings as any).gameMode !== undefined && !this.inEnum((settings as any).gameMode, VALID_GAME_MODES)) {
            errors.push(`gameMode (${(settings as any).gameMode}) is not a valid game mode`);
        }

        // Validate special mode
        if ((settings as any).specialMode !== undefined && !this.inEnum((settings as any).specialMode, VALID_SPECIAL_MODES)) {
            errors.push(`specialMode (${(settings as any).specialMode}) is not a valid special mode`);
        }

        // Validate rules preset
        if ((settings as any).rulesPreset !== undefined && !this.inEnum((settings as any).rulesPreset, VALID_RULES_PRESETS)) {
            errors.push(`rulesPreset (${(settings as any).rulesPreset}) is not a valid rules preset`);
        }

        // Validate task bar updates
        if (settings.taskbarUpdates !== undefined && !this.inEnum(settings.taskbarUpdates, VALID_TASKBAR_MODES)) {
            errors.push(`taskbarUpdates (${settings.taskbarUpdates}) is not a valid task bar mode`);
        }

        return errors;
    }

    /**
     * Perform a full validation of game settings.
     *
     * @param settings The game settings to validate.
     * @returns A {@link ValidationResult} with valid flag and array of error messages.
     */
    static validateGameSettings(settings: Partial<GameSettings>): ValidationResult {
        // NOTE: When @skeldjs/au-protocol is updated with GameSettings.validate(),
        // this method should delegate to it. For now, Waterway maintains its own
        // validation that mirrors the SkeldJS protocol-level checks.

        const errors: string[] = [];

        errors.push(...this.validateCommonSettings(settings));

        const gameMode = (settings as any).gameMode ?? GameMode.Normal;
        switch (gameMode) {
            case GameMode.Normal:
            case GameMode.NormalFools:
                errors.push(...this.validateNormalModeSettings(settings));
                break;
            case GameMode.HideNSeek:
            case GameMode.HideNSeekFools:
                errors.push(...this.validateHideAndSeekSettings(settings));
                break;
        }

        if (settings.roleSettings) {
            errors.push(...this.validateRoleSettings(settings.roleSettings as AllRoleSettings));
        }

        return {
            valid: errors.length === 0,
            errors,
        };
    }

    /**
     * Validate a complete GameSettings object.
     * Convenience method that calls validateGameSettings with the settings data.
     */
    static validateGameSettingsObject(settings: GameSettings): ValidationResult {
        return this.validateGameSettings(settings as any);
    }

    /**
     * Check whether role-specific settings have valid values for the given role type.
     */
    static validateSingleRole(roleType: RoleType, roleSettings: AllRoleSettings): string[] {
        const errors: string[] = [];

        switch (roleType) {
            case RoleType.Scientist:
                if (!this.inRange(roleSettings.scientistCooldown,
                    ROLE_OPTION_RANGES.scientistCooldown.min,
                    ROLE_OPTION_RANGES.scientistCooldown.max)) {
                    errors.push(`Scientist cooldown must be between 5 and 60`);
                }
                if (!this.inRange(roleSettings.scientistBatteryCharge,
                    ROLE_OPTION_RANGES.scientistBatteryCharge.min,
                    ROLE_OPTION_RANGES.scientistBatteryCharge.max)) {
                    errors.push(`Scientist battery charge must be between 5 and 30`);
                }
                break;
            case RoleType.Engineer:
                if (!this.inRange(roleSettings.engineerCooldown,
                    ROLE_OPTION_RANGES.engineerCooldown.min,
                    ROLE_OPTION_RANGES.engineerCooldown.max)) {
                    errors.push(`Engineer cooldown must be between 5 and 60`);
                }
                if (!this.inRange(roleSettings.engineerInVentMaxTime,
                    ROLE_OPTION_RANGES.engineerInVentMaxTime.min,
                    ROLE_OPTION_RANGES.engineerInVentMaxTime.max)) {
                    errors.push(`Engineer vent time must be between 0 and 60`);
                }
                break;
            case RoleType.GuardianAngel:
                if (!this.inRange(roleSettings.guardianAngelCooldown,
                    ROLE_OPTION_RANGES.guardianAngelCooldown.min,
                    ROLE_OPTION_RANGES.guardianAngelCooldown.max)) {
                    errors.push(`Guardian Angel cooldown must be between 35 and 120`);
                }
                if (!this.inRange(roleSettings.guardianAngelPotectionDuration,
                    ROLE_OPTION_RANGES.guardianAngelPotectionDuration.min,
                    ROLE_OPTION_RANGES.guardianAngelPotectionDuration.max)) {
                    errors.push(`Guardian Angel protection duration must be between 5 and 30`);
                }
                break;
            case RoleType.Shapeshifter:
                if (!this.inRange(roleSettings.shapeshifterCooldown,
                    ROLE_OPTION_RANGES.shapeshifterCooldown.min,
                    ROLE_OPTION_RANGES.shapeshifterCooldown.max)) {
                    errors.push(`Shapeshifter cooldown must be between 5 and 60`);
                }
                if (!this.inRange(roleSettings.shapeshiftDuration,
                    ROLE_OPTION_RANGES.shapeshiftDuration.min,
                    ROLE_OPTION_RANGES.shapeshiftDuration.max)) {
                    errors.push(`Shapeshift duration must be between 5 and 30`);
                }
                break;
            case RoleType.Noisemaker:
                if (!this.inRange(roleSettings.noisemakerAlertDuration,
                    ROLE_OPTION_RANGES.noisemakerAlertDuration.min,
                    ROLE_OPTION_RANGES.noisemakerAlertDuration.max)) {
                    errors.push(`Noisemaker alert duration must be between 1 and 30`);
                }
                break;
            case RoleType.Phantom:
                if (!this.inRange(roleSettings.phantomCooldown,
                    ROLE_OPTION_RANGES.phantomCooldown.min,
                    ROLE_OPTION_RANGES.phantomCooldown.max)) {
                    errors.push(`Phantom cooldown must be between 5 and 60`);
                }
                if (!this.inRange(roleSettings.phantomDuration,
                    ROLE_OPTION_RANGES.phantomDuration.min,
                    ROLE_OPTION_RANGES.phantomDuration.max)) {
                    errors.push(`Phantom duration must be between 5 and 60`);
                }
                break;
            case RoleType.Tracker:
                if (!this.inRange(roleSettings.trackerCooldown,
                    ROLE_OPTION_RANGES.trackerCooldown.min,
                    ROLE_OPTION_RANGES.trackerCooldown.max)) {
                    errors.push(`Tracker cooldown must be between 5 and 60`);
                }
                if (!this.inRange(roleSettings.trackerDuration,
                    ROLE_OPTION_RANGES.trackerDuration.min,
                    ROLE_OPTION_RANGES.trackerDuration.max)) {
                    errors.push(`Tracker duration must be between 5 and 60`);
                }
                if (!this.inRange(roleSettings.trackerDelay,
                    ROLE_OPTION_RANGES.trackerDelay.min,
                    ROLE_OPTION_RANGES.trackerDelay.max)) {
                    errors.push(`Tracker delay must be between 1 and 10`);
                }
                break;
            case RoleType.Detective:
                if (!this.inRange(roleSettings.detectiveSuspectLimit,
                    ROLE_OPTION_RANGES.detectiveSuspectLimit.min,
                    ROLE_OPTION_RANGES.detectiveSuspectLimit.max)) {
                    errors.push(`Detective suspect limit must be between 1 and 10`);
                }
                break;
            case RoleType.Viper:
                if (!this.inRange(roleSettings.viperDissolveTime,
                    ROLE_OPTION_RANGES.viperDissolveTime.min,
                    ROLE_OPTION_RANGES.viperDissolveTime.max)) {
                    errors.push(`Viper dissolve time must be between 5 and 60`);
                }
                break;
        }

        return errors;
    }
}
