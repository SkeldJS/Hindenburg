import { Player, RoleType, RoleTeamType, RoleMetadata } from "@skeldjs/au-core";
import { Room } from "../../Room";
import { BaseRole } from "./BaseRole";

/**
 * Viper Role
 *
 * When this impostor kills a player, the target doesn't die immediately.
 * Instead, they become "poisoned" and die after a dissolve delay.
 * This creates confusion as the kill is delayed and may happen during
 * a meeting or while the viper is elsewhere (providing an alibi).
 *
 * This is an Impostor role.
 */
export class ViperRole extends BaseRole {
    static roleMetadata: RoleMetadata = {
        roleType: RoleType.Viper,
        roleTeam: RoleTeamType.Impostor,
        isGhostRole: false,
        tasksCountTowardsProgress: false,
    };

    /** Set of poisoned player IDs awaiting dissolve. */
    private _poisonedPlayers: Map<number, number> = new Map();

    get dissolveTime(): number {
        return (this.room.settings.roleSettings as any).viperDissolveTime || 15;
    }

    onGameStart(): void {
        this.isActive = true;
        this._poisonedPlayers.clear();
        this.room.logger.info("%s is the Viper (dissolve time: %ss)",
            this.player, this.dissolveTime);
    }

    /**
     * When the Viper kills, the target is poisoned instead of dying immediately.
     * Returns false to prevent normal kill processing — Viper handles it.
     */
    onKill(target: Player<Room>): boolean {
        if (!this.isActive) return true;

        this.room.logger.info("%s (Viper) poisoned %s (dissolve in %ss)",
            this.player, target, this.dissolveTime);

        // Track poison with remaining time
        this._poisonedPlayers.set(target.clientId, this.dissolveTime);

        // Send a message to the target
        this.room.sendChat(
            `<color=#9900cc>You feel a sharp sting... something is wrong...</color>`,
            { targets: [target] }
        );

        return false; // Prevent normal kill — Viper handles it
    }

    /**
     * Actually kill the poisoned target after the dissolve time.
     */
    private dissolveTarget(target: Player<Room>): void {
        this._poisonedPlayers.delete(target.clientId);

        // Check if already dead
        const playerInfo = target.getPlayerInfo();
        if (playerInfo?.isDead) {
            this.room.logger.debug("%s (Viper) target %s was already dead, skipping dissolve",
                this.player, target);
            return;
        }

        this.room.logger.info("%s (Viper) poison dissolved on %s", this.player, target);

        this.room.sendChat(
            `<color=#9900cc>${target.username || "Someone"} succumbed to poison!</color>`
        );

        // Kill via normal game mechanics
        target.characterControl?.causeToDie("exiled");
    }

    onFixedUpdate(): void {
        for (const [playerId, remaining] of this._poisonedPlayers) {
            const newRemaining = remaining - 0.1;
            if (newRemaining <= 0) {
                const target = this.room.players.get(playerId);
                if (target) {
                    this.dissolveTarget(target);
                } else {
                    this._poisonedPlayers.delete(playerId);
                }
            } else {
                this._poisonedPlayers.set(playerId, newRemaining);
            }
        }
    }

    /**
     * Check if a player is currently poisoned by this Viper.
     */
    isPoisoned(playerId: number): boolean {
        return this._poisonedPlayers.has(playerId);
    }

    /**
     * Clear all active poisons.
     */
    clearAllPoisons(): void {
        this._poisonedPlayers.clear();
    }

    onDeath(): boolean {
        this.clearAllPoisons();
        this.isActive = false;
        return true;
    }

    onGameEnd(): void {
        this.clearAllPoisons();
        this.isActive = false;
    }
}
