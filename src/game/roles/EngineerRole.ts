import { Player, RoleType, RoleTeamType, RoleMetadata } from "@skeldjs/au-core";
import { Room } from "../../Room";
import { BaseRole } from "./BaseRole";

/**
 * Engineer Role
 *
 * A Crewmate role that can use vents (normally an Impostor-only ability).
 * The Engineer has a limited number of vent uses per game, defined in
 * the role settings (crewmateVentUses).
 *
 * Vent usage (EnterVent/ExitVent RPCs) is handled by SkeldJS PlayerPhysics.
 * This role tracks the remaining vent uses and blocks venting when exhausted.
 */
export class EngineerRole extends BaseRole {
    static roleMetadata: RoleMetadata = {
        roleType: RoleType.Engineer,
        roleTeam: RoleTeamType.Crewmate,
        isGhostRole: false,
        tasksCountTowardsProgress: true,
    };

    /** Number of vent uses remaining for this Engineer. */
    ventUsesRemaining: number = 0;

    /** Maximum vent uses from role settings. */
    get maxVentUses(): number {
        return (this.room.settings.roleSettings as any).engineerVentUses
            ?? this.room.settings.crewmateVentUses
            ?? 10;
    }

    onGameStart(): void {
        this.isActive = true;
        this.ventUsesRemaining = this.maxVentUses;
        this.room.logger.info("%s is the Engineer (vent uses: %s)",
            this.player, this.ventUsesRemaining);
    }

    /**
     * Called when the Engineer uses a vent.
     * Returns whether the vent usage is allowed.
     */
    onVentUse(): boolean {
        if (!this.isActive) return false;

        if (this.ventUsesRemaining <= 0) {
            this.room.logger.info("%s (Engineer) has no vent uses remaining", this.player);
            return false;
        }

        this.ventUsesRemaining--;
        this.room.logger.debug("%s (Engineer) used vent, %s remaining",
            this.player, this.ventUsesRemaining);
        return true;
    }

    onDeath(): boolean {
        this.isActive = false;
        return true;
    }

    onGameEnd(): void {
        this.isActive = false;
    }
}
