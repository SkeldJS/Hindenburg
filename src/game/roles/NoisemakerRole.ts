import { Player, RoleType, RoleTeamType, RoleMetadata } from "@skeldjs/au-core";
import { Room } from "../../Room";
import { BaseRole } from "./BaseRole";

/**
 * Noisemaker Role
 *
 * When this player completes a task, they emit a noise alert that reveals
 * their position to nearby players (and optionally to impostors).
 *
 * This is a Crewmate role.
 */
export class NoisemakerRole extends BaseRole {
    static roleMetadata: RoleMetadata = {
        roleType: RoleType.Noisemaker,
        roleTeam: RoleTeamType.Crewmate,
        isGhostRole: false,
        tasksCountTowardsProgress: true,
    };

    /** Remaining alert effect time (seconds). */
    private _alertTimer: number = 0;

    /** Remaining cooldown before next alert (seconds). */
    private _cooldownTimer: number = 0;

    get alertDuration(): number {
        return (this.room.settings.roleSettings as any).noisemakerAlertDuration || 10;
    }

    /** Whether impostors also see the alert. */
    get impostorAlert(): boolean {
        return (this.room.settings.roleSettings as any).noisemakerImpostorAlert !== false;
    }

    onGameStart(): void {
        this.isActive = true;
        this._alertTimer = 0;
        this._cooldownTimer = 0;
        this.room.logger.info("%s is the Noisemaker (alert duration: %ss, impostor alert: %s)",
            this.player, this.alertDuration, this.impostorAlert);
    }

    onTaskComplete(_taskIdx: number): void {
        if (!this.isActive) return;
        if (this._cooldownTimer > 0) return;

        this.room.logger.info("%s (Noisemaker) completed task, triggering alert!", this.player);
        this.triggerAlert();
    }

    /**
     * Trigger the noise alert, revealing this player's position.
     * The Among Us client shows a map-wide arrow/indicator when a Noisemaker
     * triggers an alert.
     */
    private triggerAlert(): void {
        const characterControl = this.player.characterControl;
        if (!characterControl) return;

        // Send alert chat message
        this.room.sendChat(
            `<color=orange>${this.player.username || "Someone"} triggered a Noisemaker alert!</color>`
        );

        // Start alert effect timer
        this._alertTimer = this.alertDuration;
        this._cooldownTimer = this.alertDuration;

        this.room.logger.debug("Noisemaker alert active for %ss", this.alertDuration);
    }

    onFixedUpdate(): void {
        if (this._alertTimer > 0) {
            this._alertTimer -= 0.1;
            if (this._alertTimer <= 0) {
                this._alertTimer = 0;
                this.room.logger.debug("%s Noisemaker alert expired", this.player);
            }
        }

        if (this._cooldownTimer > 0) {
            this._cooldownTimer -= 0.1;
            if (this._cooldownTimer <= 0) {
                this._cooldownTimer = 0;
            }
        }
    }

    onDeath(): boolean {
        this._alertTimer = 0;
        this.isActive = false;
        return true;
    }

    onGameEnd(): void {
        this._alertTimer = 0;
        this.isActive = false;
    }
}
