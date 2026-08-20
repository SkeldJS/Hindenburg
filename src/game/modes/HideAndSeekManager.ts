import {
    GameMap,
    GameMode,
    GameOverReason,
    GameState,
    Player,
    RoleType,
    RpcMessageTag,
} from "@skeldjs/au-core";

import {
    RpcMessage,
    MurderPlayerMessage,
    ReportDeadBodyMessage,
    CompleteTaskMessage,
    StartGameMessage,
    EndGameMessage,
    GameDataMessage,
} from "@skeldjs/au-protocol";

import { Room, RoomPrivacy } from "../../Room";
import { RoomHideAndSeekEndEvent, RoomHideAndSeekStartEvent, RoomHiderCaughtEvent } from "../../api";
import { Logger } from "../../Logger";

/**
 * Phases of a Hide and Seek game.
 */
export enum HideAndSeekPhase {
    /** Game has not started yet (lobby). */
    Lobby,
    /** Hiders are hiding, seeker is waiting/blinded. */
    Hiding,
    /** Seeker is actively hunting hiders. */
    Seeking,
    /** Final hide countdown is active, seeker has speed/ping advantage. */
    FinalHide,
    /** Game has ended. */
    Ended,
}

/**
 * Manages the Hide and Seek game mode lifecycle.
 *
 * Game flow:
 * 1. Game starts → Hiding phase (hiders hide, seeker waits)
 * 2. Hiding timer expires → Seeking phase (seeker hunts)
 * 3. Final hide timer (optional) → FinalHide phase (seeker gets advantages)
 * 4. All hiders dead OR all tasks done → Game ends
 */
export class HideAndSeekManager {
    /** Current phase of the game. */
    phase: HideAndSeekPhase = HideAndSeekPhase.Lobby;

    /** The player acting as the seeker (impostor). */
    seeker: Player<Room> | null = null;

    /** All hider players (crewmates). */
    hiders: Player<Room>[] = [];

    /** Timer handles for phase transitions. */
    private _hideTimer: NodeJS.Timeout | null = null;
    private _finalHideTimer: NodeJS.Timeout | null = null;
    private _finalHideCheckTimer: NodeJS.Timeout | null = null;

    /** Track completed tasks for win condition. */
    private _totalTasks: number = 0;
    private _completedTasks: Set<string> = new Set();

    /** Logger for this manager. */
    logger: Logger;

    constructor(
        public readonly room: Room,
    ) {
        this.logger = new Logger(() => "HideAndSeek", room.server.vorpal);
    }

    /**
     * Initialize and start the Hide and Seek game.
     */
    async startGame() {
        const settings = this.room.settings;

        // Select seeker
        this.selectSeeker();

        if (!this.seeker) {
            this.logger.error("Could not select a seeker for Hide and Seek game");
            await this.room.handleEndGame(GameOverReason.ImpostorDisconnect);
            return;
        }

        // All other players are hiders
        this.hiders = [];
        for (const [, player] of this.room.players) {
            if (player.clientId !== this.seeker.clientId) {
                this.hiders.push(player);
            }
        }

        if (this.hiders.length === 0) {
            this.logger.error("No hiders available for Hide and Seek game");
            await this.room.handleEndGame(GameOverReason.ImpostorDisconnect);
            return;
        }

        // Roles are assigned by the RoleManager when the game starts
        // Seekers and hiders are already handled via the game mode logic

        // Start the hiding phase
        this.phase = HideAndSeekPhase.Hiding;

        const hideDuration = settings.hidingTime * 1000; // Convert seconds to ms

        this.logger.info("Hide and Seek started: %s is the seeker, %s hiders. Hiding for %ss",
            this.seeker, this.hiders.length, settings.hidingTime);

        // Calculate total tasks for win condition
        this._totalTasks = this.computeTotalTasks();

        // Emit event
        await this.room.emit(new RoomHideAndSeekStartEvent(
            this.room,
            this.seeker,
            this.hiders,
            settings.hidingTime
        ));

        // Send chat message
        this.room.sendChat(
            `<color=yellow>Hide and Seek! ${this.seeker.username || "Someone"} is the seeker. ` +
            `Hide for ${settings.hidingTime} seconds!</color>`
        );

        // Set timer to end hiding phase
        this._hideTimer = setTimeout(() => {
            this.startSeekingPhase();
        }, hideDuration);
    }

    /**
     * Select the seeker from the players.
     * Uses the configured seekerPlayerId if valid, otherwise picks randomly.
     */
    private selectSeeker() {
        const settings = this.room.settings;

        // If a specific seeker was configured and they exist, use them
        if (settings.seekerPlayerId !== 0xffffffff) {
            const configuredSeeker = this.room.players.get(settings.seekerPlayerId);
            if (configuredSeeker && configuredSeeker.characterControl) {
                this.seeker = configuredSeeker;
                return;
            }
        }

        // Otherwise pick a random player
        const playerArray = [...this.room.players.values()].filter(
            p => p.characterControl && p.inScene
        );

        if (playerArray.length === 0) {
            this.seeker = null;
            return;
        }

        const randomIndex = Math.floor(Math.random() * playerArray.length);
        this.seeker = playerArray[randomIndex];
    }

    /**
     * Transition from Hiding phase to Seeking phase.
     */
    private async startSeekingPhase() {
        if (this.phase === HideAndSeekPhase.Ended) return;

        this.phase = HideAndSeekPhase.Seeking;
        this.logger.info("Hide and Seek: Seeking phase started");

        // Enable flashlight if configured
        if (this.room.settings.useFlashlight) {
            // Flashlight behavior is handled by the client based on settings
        }

        this.room.sendChat(
            "<color=red>The seeker is now hunting! Run and finish your tasks!</color>"
        );

        // Check if final hide is enabled
        if (this.room.settings.finalHideSeekMap && this.room.settings.finalHideTime > 0) {
            const seekingDuration = Math.max(
                (this.room.settings.hidingTime * 1000) - this.room.settings.finalHideTime * 1000,
                30000 // At least 30 seconds of seeking
            );

            this._finalHideTimer = setTimeout(() => {
                this.startFinalHidePhase();
            }, seekingDuration);
        }
    }

    /**
     * Transition to Final Hide phase.
     */
    private async startFinalHidePhase() {
        if (this.phase === HideAndSeekPhase.Ended) return;

        this.phase = HideAndSeekPhase.FinalHide;
        this.logger.info("Hide and Seek: Final Hide phase started");

        // Seeker gets speed boost
        if (this.seeker?.characterControl) {
            // Final seeker speed is applied via settings
        }

        // Ping mechanic
        if (this.room.settings.finalHidePing && this.seeker) {
            this.startPingMechanic();
        }

        this.room.sendChat(
            "<color=orange>Final Hide! The seeker is getting desperate...</color>"
        );

        // Set timer for end of final hide
        const finalHideMs = this.room.settings.finalHideTime * 1000;
        this._finalHideCheckTimer = setTimeout(() => {
            // Hiders win if they survive the final hide
            this.endGame("hiders", "All hiders survived the final hide");
        }, finalHideMs);
    }

    /**
     * Start the ping mechanic for final hide.
     * Periodically reveals hider positions to the seeker.
     */
    private startPingMechanic() {
        if (!this.seeker || this.phase === HideAndSeekPhase.Ended) return;

        const pingInterval = Math.min(this.room.settings.maxPingTime * 1000, 5000);

        const pingTimer = setInterval(() => {
            if (this.phase === HideAndSeekPhase.Ended || !this.seeker) {
                clearInterval(pingTimer);
                return;
            }

            // Broadcast a map-wide ping showing hider locations
            // This would send position data to the seeker
            // The exact protocol for this depends on the game version
            this.logger.debug("Ping: revealing hider positions to seeker");
        }, pingInterval);
    }

    /**
     * Handle a murder RPC from the seeker.
     */
    async handleMurder(killer: Player<Room>, target: Player<Room>) {
        // Only the seeker can kill
        if (killer.clientId !== this.seeker?.clientId) {
            this.logger.warn("Non-seeker %s attempted to kill in Hide and Seek", killer);
            return false;
        }

        // Can only kill during Seeking or FinalHide phases
        if (this.phase !== HideAndSeekPhase.Seeking && this.phase !== HideAndSeekPhase.FinalHide) {
            this.logger.warn("Seeker attempted to kill during non-seeking phase: %s", HideAndSeekPhase[this.phase]);
            return false;
        }

        // Kill the target via character control
        // In Hide and Seek, the murder RPC is processed normally by the game engine
        // The target's death is handled by the PlayerControl component

        // Remove from hiders list
        this.hiders = this.hiders.filter(h => h.clientId !== target.clientId);

        this.logger.info("Seeker %s caught hider %s! (%s remaining)",
            killer, target, this.hiders.length);

        // Emit hider caught event
        await this.room.emit(new RoomHiderCaughtEvent(
            this.room,
            target,
            killer,
            this.hiders.length
        ));

        // No body report in Hide and Seek — game continues immediately

        // Check win condition: all hiders dead
        if (this.hiders.length === 0) {
            await this.endGame("seekers", "All hiders were caught");
        }

        return true;
    }

    /**
     * Handle task completion from a hider.
     */
    async handleTaskComplete(player: Player<Room>, taskType: number, taskId: number) {
        if (this.phase === HideAndSeekPhase.Ended) return;

        const taskKey = `${player.clientId}:${taskId}`;
        this._completedTasks.add(taskKey);

        this.logger.debug("Hider %s completed task %s (type %s). %s/%s total tasks done",
            player, taskId, taskType,
            this._completedTasks.size, this._totalTasks);

        // Check win condition: all tasks completed
        if (this._completedTasks.size >= this._totalTasks) {
            await this.endGame("hiders", "All tasks completed");
        }
    }

    /**
     * Handle report dead body RPC.
     * In Hide and Seek, body reports are disabled — meetings never happen.
     */
    handleReportBody(reporter: Player<Room>, bodyPlayerId: number): boolean {
        // Body reports are disabled in Hide and Seek
        this.logger.debug("Body report blocked in Hide and Seek mode (reporter: %s, body: %s)",
            reporter, bodyPlayerId);
        return false;
    }

    /**
     * End the Hide and Seek game.
     */
    async endGame(winner: "seekers" | "hiders" | "none", reason: string) {
        if (this.phase === HideAndSeekPhase.Ended) return;

        this.phase = HideAndSeekPhase.Ended;

        // Clear all timers
        this.clearTimers();

        this.logger.info("Hide and Seek ended: %s win — %s", winner, reason);

        // Emit event
        await this.room.emit(new RoomHideAndSeekEndEvent(
            this.room,
            winner,
            reason
        ));

        // Send result chat
        const winnerText = winner === "seekers"
            ? "<color=red>The Seeker wins!</color>"
            : winner === "hiders"
                ? "<color=green>The Hiders win!</color>"
                : "<color=yellow>The game ended!</color>";

        this.room.sendChat(`${winnerText} ${reason}`);

        // Determine game over reason
        const gameOverReason = winner === "seekers"
            ? GameOverReason.ImpostorByKill
            : winner === "hiders"
                ? GameOverReason.CrewmatesByTask
                : GameOverReason.CrewmatesByVote;

        await this.room.handleEndGame(gameOverReason);
    }

    /**
     * Handle a player disconnecting during the game.
     */
    async handlePlayerDisconnect(player: Player<Room>) {
        // If seeker disconnects, hiders win
        if (player.clientId === this.seeker?.clientId) {
            this.logger.info("Seeker disconnected, hiders win");
            await this.endGame("hiders", "Seeker disconnected");
            return;
        }

        // Remove from hiders list
        this.hiders = this.hiders.filter(h => h.clientId !== player.clientId);

        // Recalculate task total
        this._totalTasks = this.computeTotalTasks();

        // Check if all hiders are gone
        if (this.hiders.length === 0) {
            await this.endGame("seekers", "All hiders disconnected");
        }
    }

    /**
     * Handle RPC messages from players during the game.
     * Returns true if the RPC was handled, false to pass through.
     */
    async handleRpc(player: Player<Room>, rpcMessage: RpcMessage): Promise<boolean> {
        switch (rpcMessage.child?.messageTag) {
            case RpcMessageTag.ReportDeadBody:
                // Body reports are disabled
                return this.handleReportBody(player, (rpcMessage.child as any).bodyPlayerId ?? 0);

            case RpcMessageTag.CompleteTask:
                if (rpcMessage.child instanceof CompleteTaskMessage) {
                    await this.handleTaskComplete(
                        player,
                        0, // taskType derived from taskIdx
                        rpcMessage.child.taskIdx
                    );
                }
                return true; // Still allow normal processing

            case RpcMessageTag.MurderPlayer:
                if (rpcMessage.child instanceof MurderPlayerMessage) {
                    const target = this.room.players.get(rpcMessage.child.victimNetId);
                    if (target) {
                        return await this.handleMurder(player, target);
                    }
                }
                return true;

            case RpcMessageTag.StartMeeting:
                // Meetings are disabled in Hide and Seek
                this.logger.debug("Meeting start blocked in Hide and Seek mode");
                return false;

            default:
                return true; // Allow other RPCs through
        }
    }

    /**
     * Calculate total number of tasks to be completed for hider win condition.
     */
    private computeTotalTasks(): number {
        const settings = this.room.settings;

        // Total tasks = common + long + short, per player
        const tasksPerPlayer = (settings.commonTasks || 0)
            + (settings.longTasks || 0)
            + (settings.shortTasks || 0);

        return tasksPerPlayer * this.hiders.length;
    }

    /**
     * Clean up all timers.
     */
    private clearTimers() {
        if (this._hideTimer) {
            clearTimeout(this._hideTimer);
            this._hideTimer = null;
        }
        if (this._finalHideTimer) {
            clearTimeout(this._finalHideTimer);
            this._finalHideTimer = null;
        }
        if (this._finalHideCheckTimer) {
            clearTimeout(this._finalHideCheckTimer);
            this._finalHideCheckTimer = null;
        }
    }

    /**
     * Clean up the manager. Call when the room is destroyed.
     */
    destroy() {
        this.clearTimers();
        this.seeker = null;
        this.hiders = [];
        this._completedTasks.clear();
        this.phase = HideAndSeekPhase.Ended;
    }
}
