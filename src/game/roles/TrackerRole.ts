import { Player, RoleType, RoleTeamType, RoleMetadata } from "@skeldjs/au-core";
import { Room } from "../../Room";
import { BaseRole } from "./BaseRole";

/**
 * Tracker Role
 *
 * Can mark a target player and receive periodic position updates
 * (arrow indicators pointing to the target's direction on the map).
 *
 * This is a Crewmate role.
 */
export class TrackerRole extends BaseRole {
    static roleMetadata: RoleMetadata = {
        roleType: RoleType.Tracker,
        roleTeam: RoleTeamType.Crewmate,
        isGhostRole: false,
        tasksCountTowardsProgress: true,
    };

    /** The currently tracked player, if any. */
    trackedTarget: Player<Room> | null = null;

    /** Remaining tracking duration (seconds). */
    private _trackingTimer: number = 0;

    /** Remaining cooldown before next track (seconds). */
    private _cooldownTimer: number = 0;

    /** Time since last position update (seconds). */
    private _updateTimer: number = 0;

    get cooldown(): number {
        return (this.room.settings.roleSettings as any).trackerCooldown || 15;
    }

    get duration(): number {
        return (this.room.settings.roleSettings as any).trackerDuration || 30;
    }

    get delay(): number {
        return (this.room.settings.roleSettings as any).trackerDelay || 1;
    }

    onGameStart(): void {
        this.isActive = true;
        this.trackedTarget = null;
        this._trackingTimer = 0;
        this._cooldownTimer = 0;
        this._updateTimer = 0;
        this.room.logger.info("%s is the Tracker (duration: %ss, cooldown: %ss, delay: %ss)",
            this.player, this.duration, this.cooldown, this.delay);
    }

    onAbilityUse(target?: Player<Room>): boolean {
        if (!target) {
            this.room.logger.warn("%s (Tracker) attempted to track but no target specified", this.player);
            return false;
        }

        if (!this.canUseAbility()) {
            this.room.logger.warn("%s (Tracker) ability on cooldown", this.player);
            return false;
        }

        if (target.clientId === this.player.clientId) {
            this.room.logger.warn("%s (Tracker) attempted to track themselves", this.player);
            return false;
        }

        this.trackedTarget = target;
        this._trackingTimer = this.duration;
        this._updateTimer = 0;
        this.startCooldown(this.cooldown * 1000);

        this.room.logger.info("%s (Tracker) is now tracking %s", this.player, target);

        this.room.sendChat(
            `<color=#00ccff>Tracker is on the hunt...</color>`,
            { targets: [this.player] }
        );

        return true;
    }

    /**
     * Send a position update about the tracked target to this player.
     * The Among Us client displays an arrow pointing to the target's location.
     */
    private sendPositionUpdate(): void {
        if (!this.trackedTarget?.characterControl) {
            this.stopTracking();
            return;
        }

        // In SaaH mode, the server can directly read the target's position
        // and send it to the tracker. The client handles arrow display
        // based on the tracked player's transform data.
        const transform = this.trackedTarget.characterControl.getComponentSafe(
            2, "CustomNetworkTransform" as any
        ) as any;

        if (transform) {
            this.room.logger.debug("%s (Tracker) position update for %s: (%.1f, %.1f)",
                this.player, this.trackedTarget,
                transform.X ?? 0, transform.Y ?? 0);
        }
    }

    /**
     * Stop tracking the current target.
     */
    private stopTracking(): void {
        if (this.trackedTarget) {
            this.room.logger.info("%s (Tracker) stopped tracking %s",
                this.player, this.trackedTarget);
        }
        this.trackedTarget = null;
        this._trackingTimer = 0;
        this._updateTimer = 0;
    }

    onFixedUpdate(): void {
        if (this.trackedTarget && this._trackingTimer > 0) {
            this._trackingTimer -= 0.1;
            this._updateTimer -= 0.1;

            if (this._updateTimer <= 0) {
                this.sendPositionUpdate();
                this._updateTimer = this.delay;
            }

            if (this._trackingTimer <= 0) {
                this.stopTracking();
            }
        }

        if (!this.trackedTarget && this._cooldownTimer > 0) {
            this._cooldownTimer -= 0.1;
            if (this._cooldownTimer <= 0) {
                this._cooldownTimer = 0;
            }
        }
    }

    onDeath(): boolean {
        this.stopTracking();
        this.isActive = false;
        return true;
    }

    onGameEnd(): void {
        this.stopTracking();
        this.isActive = false;
    }
}
