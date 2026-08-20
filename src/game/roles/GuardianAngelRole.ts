import { Player, RoleType, RoleTeamType, RoleMetadata } from "@skeldjs/au-core";
import { Room } from "../../Room";
import { BaseRole } from "./BaseRole";

/**
 * GuardianAngel Role
 *
 * A Crewmate role that can cast a protective shield on a living player.
 * The shield blocks one kill attempt and then dissipates.
 *
 * RPC flow (handled by SkeldJS PlayerControl):
 *   1. GA selects target → client sends CheckProtect RPC (48) to host
 *   2. Host/server broadcasts ProtectPlayer RPC (45) → applies shield
 *   3. Kill attempt on shielded target → MurderResultFlags.FailedProtected
 *
 * The shield duration and cooldown come from role settings.
 * Protection removal (on timeout or successful block) is handled
 * by PlayerControl.processFixedUpdate.
 */
export class GuardianAngelRole extends BaseRole {
    static roleMetadata: RoleMetadata = {
        roleType: RoleType.GuardianAngel,
        roleTeam: RoleTeamType.Crewmate,
        isGhostRole: false,
        tasksCountTowardsProgress: true,
    };

    /** Remaining cooldown before GA can protect again (seconds). */
    private _cooldownTimer: number = 0;

    /** The player currently protected by this GA, if any. */
    protectedTarget: Player<Room> | null = null;

    get cooldown(): number {
        // Overrides from role settings if available
        const settings = this.room.settings.roleSettings as any;
        return settings.guardianAngelCooldown ?? 35;
    }

    get protectionDuration(): number {
        const settings = this.room.settings.roleSettings as any;
        return settings.guardianAngelProtectionDuration ?? 10;
    }

    onGameStart(): void {
        this.isActive = true;
        this._cooldownTimer = 0;
        this.protectedTarget = null;
        this.room.logger.info("%s is the GuardianAngel (cooldown: %ss, duration: %ss)",
            this.player, this.cooldown, this.protectionDuration);
    }

    /**
     * Attempt to protect a target player.
     * Called when the GA uses their ability.
     */
    onAbilityUse(target?: Player<Room>): boolean {
        if (!target) {
            this.room.logger.warn("%s (GA) attempted to protect but no target specified", this.player);
            return false;
        }

        if (!this.canUseAbility()) {
            this.room.logger.warn("%s (GA) ability on cooldown (%ss remaining)",
                this.player, Math.ceil(this._cooldownTimer));
            return false;
        }

        const targetInfo = target.getPlayerInfo();
        if (targetInfo?.isDead) {
            this.room.logger.warn("%s (GA) attempted to protect dead player %s", this.player, target);
            return false;
        }

        if (target.clientId === this.player.clientId) {
            this.room.logger.warn("%s (GA) attempted to protect themselves", this.player);
            return false;
        }

        // Apply protection via PlayerControl
        if (target.characterControl) {
            target.characterControl.protectedByGuardian = true;
            (target.characterControl as any)._protectedByGuardianTime = this.protectionDuration;
            target.characterControl.guardianProtector = this.player;
        }

        this.protectedTarget = target;
        this.startCooldown(this.cooldown * 1000);
        this._cooldownTimer = this.cooldown;

        this.room.logger.info("%s (GA) protected %s for %ss",
            this.player, target, this.protectionDuration);

        return true;
    }

    onFixedUpdate(): void {
        if (this._cooldownTimer > 0) {
            this._cooldownTimer -= 0.1; // Fixed update tick delta
            if (this._cooldownTimer <= 0) {
                this._cooldownTimer = 0;
            }
        }
    }

    onDeath(): boolean {
        // Remove protection when GA dies
        if (this.protectedTarget?.characterControl) {
            this.protectedTarget.characterControl.protectedByGuardian = false;
            this.protectedTarget.characterControl.guardianProtector = undefined;
        }
        this.protectedTarget = null;
        this.isActive = false;
        return true;
    }

    onGameEnd(): void {
        this.protectedTarget = null;
        this.isActive = false;
    }
}
