import { Player, RoleType, RoleTeamType, RoleMetadata } from "@skeldjs/au-core";
import { Room } from "../../Room";
import { BaseRole } from "./BaseRole";

/**
 * Shapeshifter Role
 *
 * An Impostor role that can temporarily transform into another player's
 * appearance. While transformed, the Shapeshifter looks exactly like the
 * target player (name, color, cosmetics) to all other players.
 *
 * RPC flow (handled by SkeldJS PlayerControl):
 *   1. SS selects target → client sends CheckShapeshift RPC (55) to host
 *   2. Host/server validates: SS role? Not in cooldown? Target valid?
 *   3a. Valid → broadcast Shapeshift RPC (46) → all clients see transformation
 *   3b. Invalid → broadcast RejectShapeshift RPC (56)
 *   4. Duration expires → auto-revert to original appearance
 *
 * Duration and cooldown come from role settings.
 */
export class ShapeshifterRole extends BaseRole {
    static roleMetadata: RoleMetadata = {
        roleType: RoleType.Shapeshifter,
        roleTeam: RoleTeamType.Impostor,
        isGhostRole: false,
        tasksCountTowardsProgress: false,
    };

    /** Whether the SS is currently transformed. */
    isTransformed: boolean = false;

    /** The player whose appearance was copied. */
    transformTarget: Player<Room> | null = null;

    /** Remaining duration of current transformation (seconds). */
    private _transformTimer: number = 0;

    /** Remaining cooldown before next transformation (seconds). */
    private _cooldownTimer: number = 0;

    /** Original outfit data saved before transformation. */
    private _savedOutfit: any = null;

    get duration(): number {
        const settings = this.room.settings.roleSettings as any;
        return settings.shapeshifterDuration ?? 30;
    }

    get cooldown(): number {
        const settings = this.room.settings.roleSettings as any;
        return settings.shapeshifterCooldown ?? 10;
    }

    onGameStart(): void {
        this.isActive = true;
        this.isTransformed = false;
        this.transformTarget = null;
        this._transformTimer = 0;
        this._cooldownTimer = 0;
        this.room.logger.info("%s is the Shapeshifter (duration: %ss, cooldown: %ss)",
            this.player, this.duration, this.cooldown);
    }

    /**
     * Transform into the target player's appearance.
     */
    onAbilityUse(target?: Player<Room>): boolean {
        if (!target) {
            this.room.logger.warn("%s (SS) attempted to shapeshift but no target specified", this.player);
            return false;
        }

        if (!this.canUseAbility()) {
            this.room.logger.warn("%s (SS) ability on cooldown (%ss remaining)",
                this.player, Math.ceil(this._cooldownTimer));
            return false;
        }

        if (this.isTransformed) {
            this.room.logger.warn("%s (SS) attempted to shapeshift while already transformed", this.player);
            return false;
        }

        const targetInfo = target.getPlayerInfo();
        if (targetInfo?.isDead) {
            this.room.logger.warn("%s (SS) attempted to shapeshift into dead player %s", this.player, target);
            return false;
        }

        // Save original outfit and apply target's appearance
        const playerInfo = this.player.getPlayerInfo();
        if (playerInfo?.currentOutfit) {
            this._savedOutfit = {
                name: playerInfo.currentOutfit.name,
                color: playerInfo.currentOutfit.color,
                hatId: playerInfo.currentOutfit.hatId,
                skinId: playerInfo.currentOutfit.skinId,
                visorId: playerInfo.currentOutfit.visorId,
                petId: playerInfo.currentOutfit.petId,
            };

            const targetOutfit = targetInfo?.currentOutfit;
            if (targetOutfit) {
                playerInfo.currentOutfit.name = targetOutfit.name;
                playerInfo.currentOutfit.color = targetOutfit.color;
                playerInfo.currentOutfit.hatId = targetOutfit.hatId;
                playerInfo.currentOutfit.skinId = targetOutfit.skinId;
                playerInfo.currentOutfit.visorId = targetOutfit.visorId;
                playerInfo.currentOutfit.petId = targetOutfit.petId;
            }
        }

        this.isTransformed = true;
        this.transformTarget = target;
        this._transformTimer = this.duration;

        this.room.logger.info("%s (SS) transformed into %s for %ss",
            this.player, target, this.duration);

        return true;
    }

    /**
     * Revert to original appearance.
     */
    revertTransform(): void {
        if (!this.isTransformed) return;

        const playerInfo = this.player.getPlayerInfo();
        if (playerInfo?.currentOutfit && this._savedOutfit) {
            playerInfo.currentOutfit.name = this._savedOutfit.name;
            playerInfo.currentOutfit.color = this._savedOutfit.color;
            playerInfo.currentOutfit.hatId = this._savedOutfit.hatId;
            playerInfo.currentOutfit.skinId = this._savedOutfit.skinId;
            playerInfo.currentOutfit.visorId = this._savedOutfit.visorId;
            playerInfo.currentOutfit.petId = this._savedOutfit.petId;

            // Push data update so clients see the reverted appearance
            playerInfo.pushDataState(1 as any);
        }

        this.isTransformed = false;
        this.transformTarget = null;
        this._savedOutfit = null;

        this.room.logger.info("%s (SS) reverted to original appearance", this.player);

        // Start cooldown
        this._cooldownTimer = this.cooldown;
    }

    onFixedUpdate(): void {
        if (this.isTransformed && this._transformTimer > 0) {
            this._transformTimer -= 0.1;
            if (this._transformTimer <= 0) {
                this._transformTimer = 0;
                this.revertTransform();
            }
        }

        if (!this.isTransformed && this._cooldownTimer > 0) {
            this._cooldownTimer -= 0.1;
            if (this._cooldownTimer <= 0) {
                this._cooldownTimer = 0;
            }
        }
    }

    onDeath(): boolean {
        if (this.isTransformed) {
            this.revertTransform();
        }
        this.isActive = false;
        return true;
    }

    onGameEnd(): void {
        if (this.isTransformed) {
            this.revertTransform();
        }
        this.isActive = false;
    }
}
