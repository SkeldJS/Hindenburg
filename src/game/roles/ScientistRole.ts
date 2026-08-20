import { Player, RoleType, RoleTeamType, RoleMetadata } from "@skeldjs/au-core";
import { Room } from "../../Room";
import { BaseRole } from "./BaseRole";

/**
 * Scientist Role
 *
 * A Crewmate role that has access to the Vitals monitor at all times.
 * In the Among Us client, Vitals shows the alive/dead status of all players.
 *
 * This is a passive ability — the client handles the Vitals UI display
 * once it knows the player is a Scientist (via SetRole RPC).
 * No additional server-side RPC handling is needed.
 */
export class ScientistRole extends BaseRole {
    static roleMetadata: RoleMetadata = {
        roleType: RoleType.Scientist,
        roleTeam: RoleTeamType.Crewmate,
        isGhostRole: false,
        tasksCountTowardsProgress: true,
    };

    onGameStart(): void {
        this.isActive = true;
        this.room.logger.info("%s is the Scientist (passive: Vitals access)",
            this.player);
    }

    onDeath(): boolean {
        this.isActive = false;
        return true;
    }

    onGameEnd(): void {
        this.isActive = false;
    }
}
