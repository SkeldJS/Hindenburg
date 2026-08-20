import { Player, RoleType, RoleTeamType, RoleMetadata } from "@skeldjs/au-core";
import { Room } from "../../Room";
import { BaseRole } from "./BaseRole";

/**
 * Detective Role
 *
 * Can inspect a player to see their "suspicion" level — whether they have
 * killed someone or performed other suspicious actions.
 *
 * This is a Crewmate role.
 */
export class DetectiveRole extends BaseRole {
    static roleMetadata: RoleMetadata = {
        roleType: RoleType.Detective,
        roleTeam: RoleTeamType.Crewmate,
        isGhostRole: false,
        tasksCountTowardsProgress: true,
    };

    /** How many suspects have been inspected this game. */
    inspectedCount: number = 0;

    /** Set of player IDs that have been inspected. */
    inspectedPlayers: Set<number> = new Set();

    /** Records of player kills tracked by the detective. */
    private _murderRecords: Map<number, number> = new Map();

    /** Remaining cooldown before next inspection (seconds). */
    private _cooldownTimer: number = 0;

    /** Whether murder listener is registered. */
    private _murderListenerRegistered: boolean = false;

    get suspectLimit(): number {
        return (this.room.settings.roleSettings as any).detectiveSuspectLimit || 3;
    }

    onGameStart(): void {
        this.isActive = true;
        this.inspectedCount = 0;
        this.inspectedPlayers.clear();
        this._murderRecords.clear();
        this._cooldownTimer = 0;

        // Listen for murders to track who kills
        if (!this._murderListenerRegistered) {
            this._murderListenerRegistered = true;
            this.room.on("player.murder", (ev: any) => {
                if (ev.player && ev.victim) {
                    const killerId = ev.player.clientId;
                    const currentCount = this._murderRecords.get(killerId) || 0;
                    this._murderRecords.set(killerId, currentCount + 1);
                }
            });
        }

        this.room.logger.info("%s is the Detective (suspect limit: %s)",
            this.player, this.suspectLimit);
    }

    /**
     * Inspect a player to check their suspicion level.
     */
    onAbilityUse(target?: Player<Room>): boolean {
        if (!target) {
            this.room.logger.warn("%s (Detective) attempted to inspect but no target specified", this.player);
            return false;
        }

        if (this.inspectedPlayers.has(target.clientId)) {
            this.room.logger.warn("%s (Detective) already inspected %s", this.player, target);
            return false;
        }

        if (this.inspectedCount >= this.suspectLimit) {
            this.room.logger.warn("%s (Detective) reached the suspect limit (%s)",
                this.player, this.suspectLimit);
            return false;
        }

        if (!this.canUseAbility()) return false;

        this.inspectedCount++;
        this.inspectedPlayers.add(target.clientId);

        const kills = this._murderRecords.get(target.clientId) || 0;
        const targetInfo = target.getPlayerInfo();
        const isImpostor = targetInfo?.isImpostor || false;

        this.room.logger.info("%s (Detective) inspected %s: %s kills, isImpostor=%s",
            this.player, target, kills, isImpostor);

        // Send inspection result
        let resultMessage: string;
        if (kills > 0) {
            resultMessage = `<color=red>Detective report: ${target.username || "Player"} has committed ${kills} murder(s)! Highly suspicious!</color>`;
        } else if (isImpostor) {
            resultMessage = `<color=orange>Detective report: ${target.username || "Player"} appears suspicious but no kills detected.</color>`;
        } else {
            resultMessage = `<color=green>Detective report: ${target.username || "Player"} appears innocent.</color>`;
        }

        this.room.sendChat(resultMessage, { targets: [this.player] });

        return true;
    }

    get remainingInspections(): number {
        return Math.max(0, this.suspectLimit - this.inspectedCount);
    }

    onFixedUpdate(): void {
        if (this._cooldownTimer > 0) {
            this._cooldownTimer -= 0.1;
            if (this._cooldownTimer <= 0) {
                this._cooldownTimer = 0;
            }
        }
    }

    onDeath(): boolean {
        this.isActive = false;
        return true;
    }

    onGameEnd(): void {
        this.isActive = false;
    }
}
