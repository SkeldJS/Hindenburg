import { Player, RoleTeamType, RoleType, RoleMetadata, BaseRole as CoreBaseRole } from "@skeldjs/au-core";
import { Room } from "../../Room";

/**
 * Base class for all role implementations in Waterway.
 *
 * Extends SkeldJS's {@link BaseRole} — the role contract (identity via
 * `roleMetadata` and the lifecycle hooks) now lives in the core library.
 * Waterway adds the server-side runtime behaviors on top: cooldown
 * management, per-tick updates, and `onGameStart`/`onFixedUpdate`.
 *
 * Each concrete role defines `static roleMetadata` (single source of truth
 * in SkeldJS); `roleType`/`teamType` are convenience getters over it.
 */
export abstract class BaseRole extends CoreBaseRole<Room> {
    /** Role identity, defined once in SkeldJS. */
    static roleMetadata: RoleMetadata;

    /** The unique role type identifier from the Among Us protocol. */
    get roleType(): RoleType {
        return (this.constructor as typeof BaseRole).roleMetadata.roleType;
    }

    /** Which team this role belongs to (Crewmate or Impostor). */
    get teamType(): RoleTeamType {
        return (this.constructor as typeof BaseRole).roleMetadata.roleTeam;
    }

    /** Whether this role's ability is currently active. */
    isActive: boolean = false;

    /** The current cooldown timer for the role's ability (in milliseconds). */
    currentCooldown: number = 0;

    /** When the ability was last used (Unix timestamp in ms). */
    lastAbilityUse: number = 0;

    /** Whether this role's ability is on cooldown. */
    get isOnCooldown(): boolean {
        return this.currentCooldown > 0 && (Date.now() - this.lastAbilityUse) < this.currentCooldown;
    }

    /** The room this role exists in. */
    public readonly room: Room;

    constructor(
        room: Room,
        player: Player<Room>,
    ) {
        super(player);
        this.room = room;
    }

    /**
     * Called once when the role is assigned and the game starts.
     * Use this to initialize role state, set up timers, etc.
     */
    onGameStart(): void {}

    /**
     * Called when the player completes a task.
     *
     * @param taskIdx The index of the completed task.
     */
    onTaskComplete(taskIdx: number): void {}

    /**
     * Called when a meeting starts.
     */
    onMeetingStart(): void {}

    /**
     * Called when the player uses their role ability.
     * Subclasses override this to implement the ability.
     *
     * @param target Optional target player for targeted abilities.
     * @returns Whether the ability was successfully used.
     */
    onAbilityUse(target?: Player<Room>): boolean {
        return false;
    }

    /**
     * Called every fixed update tick while the game is running.
     * Use for cooldown management, periodic effects, etc.
     */
    onFixedUpdate(): void {}

    /**
     * Start the cooldown for this role's ability.
     * @param cooldownMs Cooldown duration in milliseconds.
     */
    protected startCooldown(cooldownMs: number): void {
        this.currentCooldown = cooldownMs;
        this.lastAbilityUse = Date.now();
    }

    /**
     * Check if the ability can be used (not on cooldown and role is active).
     */
    canUseAbility(): boolean {
        return this.isActive && !this.isOnCooldown;
    }

    /**
     * Get a human-readable name for this role type.
     */
    getRoleName(): string {
        return RoleType[this.roleType] || "Unknown";
    }
}
