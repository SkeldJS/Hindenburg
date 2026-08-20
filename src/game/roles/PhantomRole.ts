import { Player, RoleType, RoleTeamType, RoleMetadata } from "@skeldjs/au-core";
import { Room } from "../../Room";
import { BaseRole } from "./BaseRole";

/**
 * Phantom Role
 *
 * When this player is killed, instead of dying immediately, they enter a
 * "vanished" ghost state where they can continue moving invisibly for a
 * limited duration. After the duration expires, they properly die.
 *
 * RPC flow (handled by SkeldJS PlayerControl):
 *   1. Phantom dies → client sends CheckVanish RPC (62)
 *   2. Host/server validates → broadcasts StartVanish RPC (63)
 *   3. Client shows vanish animation, Phantom is invisible
 *   4. After duration, Phantom sends CheckAppear RPC (64)
 *   5. Host/server validates → broadcasts StartAppear RPC (65)
 *   6. Phantom properly dies
 *
 * This is an Impostor role.
 */
export class PhantomRole extends BaseRole {
    static roleMetadata: RoleMetadata = {
        roleType: RoleType.Phantom,
        roleTeam: RoleTeamType.Impostor,
        isGhostRole: false,
        tasksCountTowardsProgress: false,
    };

    /** Whether the phantom is currently in the vanished state. */
    isVanished: boolean = false;

    /** Remaining vanish duration (seconds). */
    private _vanishTimer: number = 0;

    /** Remaining cooldown before vanish can be used again (seconds). */
    private _cooldownTimer: number = 0;

    get cooldown(): number {
        return (this.room.settings.roleSettings as any).phantomCooldown || 15;
    }

    get duration(): number {
        return (this.room.settings.roleSettings as any).phantomDuration || 30;
    }

    onGameStart(): void {
        this.isActive = true;
        this.isVanished = false;
        this._vanishTimer = 0;
        this._cooldownTimer = 0;
        this.room.logger.info("%s is the Phantom (duration: %ss, cooldown: %ss)",
            this.player, this.duration, this.cooldown);
    }

    /**
     * The Phantom doesn't die immediately. Instead, they enter a vanished state.
     * Return false to prevent normal death processing.
     */
    onDeath(): boolean {
        if (!this.isActive) return true;

        // Enter vanished state instead of dying
        this.isVanished = true;
        this._vanishTimer = this.duration;

        this.room.logger.info("%s (Phantom) entered vanished state for %ss",
            this.player, this.duration);

        // Trigger vanish via the proper RPC flow
        if (this.player.characterControl) {
            this.player.characterControl.vanishWithAuth();
        }

        return false; // Prevent normal death
    }

    /**
     * End the vanished state and properly kill the phantom.
     */
    endVanish(): void {
        if (!this.isVanished) return;

        this.isVanished = false;
        this._vanishTimer = 0;

        // Trigger appear via the proper RPC flow
        if (this.player.characterControl) {
            this.player.characterControl.appearWithAuth(true);
        }

        // Now actually die
        const playerInfo = this.player.getPlayerInfo();
        if (playerInfo && !playerInfo.isDead) {
            this.player.characterControl?.causeToDie("exiled");
        }

        this._cooldownTimer = this.cooldown;
        this.isActive = false;

        this.room.logger.info("%s (Phantom) vanished state ended, now dead", this.player);
    }

    onFixedUpdate(): void {
        if (this.isVanished && this._vanishTimer > 0) {
            this._vanishTimer -= 0.1;
            if (this._vanishTimer <= 0) {
                this.endVanish();
            }
        }

        if (!this.isVanished && this._cooldownTimer > 0) {
            this._cooldownTimer -= 0.1;
            if (this._cooldownTimer <= 0) {
                this._cooldownTimer = 0;
                this.isActive = true;
                this.room.logger.debug("%s Phantom ability ready again", this.player);
            }
        }
    }

    onGameEnd(): void {
        this.isVanished = false;
        this.isActive = false;
    }
}
