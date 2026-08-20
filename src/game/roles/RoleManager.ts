import { Player, RoleType, RoleTeamType, BaseRole as CoreBaseRole } from "@skeldjs/au-core";
import { Room } from "../../Room";
import { BaseRole } from "./BaseRole";
import { NoisemakerRole } from "./NoisemakerRole";
import { PhantomRole } from "./PhantomRole";
import { TrackerRole } from "./TrackerRole";
import { DetectiveRole } from "./DetectiveRole";
import { ViperRole } from "./ViperRole";
import { ScientistRole } from "./ScientistRole";
import { EngineerRole } from "./EngineerRole";
import { GuardianAngelRole } from "./GuardianAngelRole";
import { ShapeshifterRole } from "./ShapeshifterRole";

/**
 * Maps role types to their implementing classes.
 */
const ROLE_CONSTRUCTORS: Partial<Record<RoleType, new (room: Room, player: Player<Room>) => BaseRole>> = {
    [RoleType.Scientist]: ScientistRole,
    [RoleType.Engineer]: EngineerRole,
    [RoleType.GuardianAngel]: GuardianAngelRole,
    [RoleType.Shapeshifter]: ShapeshifterRole,
    [RoleType.Noisemaker]: NoisemakerRole,
    [RoleType.Phantom]: PhantomRole,
    [RoleType.Tracker]: TrackerRole,
    [RoleType.Detective]: DetectiveRole,
    [RoleType.Viper]: ViperRole,
};

/**
 * Manages role assignment and lifecycle for a room.
 *
 * When a game starts, the RoleManager reads the room's role settings
 * and assigns roles to players based on the configured chances and
 * maximum player counts.
 */
export class RoleManager {
    /** All active role instances, keyed by player client ID. */
    activeRoles: Map<number, BaseRole> = new Map();

    constructor(public readonly room: Room) {}

    /**
     * Sync Waterway's server-side role behaviors from SkeldJS's role assignment.
     *
     * In Server-as-a-Host mode, SkeldJS (core) assigns roles during
     * `super.handleStartGame()` (RoleSelection components) and sets
     * `player.role`. This method creates the matching Waterway behavior role
     * instance for each player so server-side logic (cooldowns, abilities)
     * runs. Core is the single source of the role assignment — there is no
     * second role roll here.
     */
    async syncRolesFromCore(): Promise<void> {
        const assigned: BaseRole[] = [];

        for (const player of this.room.players.values()) {
            if (!player.characterControl) continue;

            const coreRole = player.role;
            if (!coreRole) continue;

            const roleMetadata = (coreRole.constructor as typeof CoreBaseRole).roleMetadata;
            if (!roleMetadata) continue;

            const RoleCtor = ROLE_CONSTRUCTORS[roleMetadata.roleType];
            if (!RoleCtor) continue;

            const role = new RoleCtor(this.room, player);
            this.activeRoles.set(player.clientId, role);
            role.onGameStart();
            assigned.push(role);
        }

        if (assigned.length > 0) {
            this.room.logger.info("Synchronized %s role behavior(s) from core assignment", assigned.length);
            for (const role of assigned) {
                const player = this.room.players.get(role.player.clientId);
                this.room.logger.info("  %s → %s", player, role.getRoleName());
            }
        }
    }

    /**
     * Create and assign a role to a specific player.
     */
    async assignRoleToPlayer(
        player: Player<Room>,
        RoleCtor: new (room: Room, player: Player<Room>) => BaseRole,
        roleType: RoleType
    ): Promise<BaseRole> {
        const role = new RoleCtor(this.room, player);
        this.activeRoles.set(player.clientId, role);

        // The player's role is tracked by this manager
        // The client-facing role is set via PlayerControl.setRole RPC
        // Must await — setRole is async and broadcasts the SetRole RPC to clients
        if (player.characterControl) {
            const roleClass = this.room.registeredRoles.get(roleType);
            if (roleClass) {
                await player.characterControl.setRole(roleClass);
            }
        }

        // Initialize the role
        role.onGameStart();

        return role;
    }

    /**
     * Get the role instance for a player, if any.
     */
    getRoleForPlayer(player: Player<Room>): BaseRole | null {
        return this.activeRoles.get(player.clientId) || null;
    }

    /**
     * Check if a player has a specific role type.
     */
    playerHasRole(player: Player<Room>, roleType: RoleType): boolean {
        const role = this.activeRoles.get(player.clientId);
        return role?.roleType === roleType;
    }

    /**
     * Called when a player with a role kills someone.
     * Routes to the appropriate role's onKill handler.
     */
    handleKill(killer: Player<Room>, target: Player<Room>): boolean {
        const role = this.activeRoles.get(killer.clientId);
        if (!role) return true; // No special role, allow normal kill

        return role.onKill(target);
    }

    /**
     * Called when a player with a role completes a task.
     * Routes to the appropriate role's onTaskComplete handler.
     */
    handleTaskComplete(player: Player<Room>, taskIdx: number): void {
        const role = this.activeRoles.get(player.clientId);
        if (!role) return;

        role.onTaskComplete(taskIdx);
    }

    /**
     * Called when a player with a role dies.
     * Routes to the appropriate role's onDeath handler.
     */
    handleDeath(player: Player<Room>): boolean {
        const role = this.activeRoles.get(player.clientId);
        if (!role) return true; // No special role, allow normal death

        const result = role.onDeath();

        // If the role allowed normal death, clean up
        if (result) {
            this.activeRoles.delete(player.clientId);
        }

        return result;
    }

    /**
     * Called when a meeting starts.
     */
    handleMeetingStart(): void {
        for (const [, role] of this.activeRoles) {
            role.onMeetingStart();
        }
    }

    /**
     * Called every fixed update tick.
     */
    handleFixedUpdate(): void {
        for (const [, role] of this.activeRoles) {
            role.onFixedUpdate();
        }
    }

    /**
     * Called when the game ends.
     * Cleans up all active roles.
     */
    handleGameEnd(): void {
        for (const [, role] of this.activeRoles) {
            role.onGameEnd();
        }
        this.activeRoles.clear();
    }

    /**
     * Called when a player uses their role ability.
     */
    handleAbilityUse(player: Player<Room>, target?: Player<Room>): boolean {
        const role = this.activeRoles.get(player.clientId);
        if (!role) return false;

        return role.onAbilityUse(target);
    }

    /**
     * Get all active role instances.
     */
    getAllRoles(): BaseRole[] {
        return [...this.activeRoles.values()];
    }

    /**
     * Register a custom role constructor.
     * Allows plugins to add new roles.
     */
    static registerRole(roleType: RoleType, ctor: new (room: Room, player: Player<Room>) => BaseRole): void {
        ROLE_CONSTRUCTORS[roleType] = ctor;
    }
}
