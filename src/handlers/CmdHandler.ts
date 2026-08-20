import * as util from "util";

import { Player, DisconnectReason } from "@skeldjs/au-core";

import { Room, MessageSide } from "../Room";
import { Connection } from "../Connection";
import { RoomPrivacy, logMaps } from "../Room";
import { GameMode, GameState, GameMap } from "@skeldjs/au-core";

/**
 * Context for a /cmd command execution.
 * Provides access to the room, caller, and response methods.
 */
export class CmdContext {
    constructor(
        public readonly room: Room,
        public readonly player: Player<Room>,
        public readonly message: string,
        public readonly args: string[]
    ) {}

    /**
     * Reply to the caller privately (only they see the response).
     */
    async reply(message: string, ...fmt: any) {
        await this.room.sendChat(util.format(message, ...fmt), {
            side: MessageSide.Left,
            targets: [this.player]
        });
    }

    /**
     * Broadcast a message to all players in the room.
     */
    async broadcast(message: string, ...fmt: any) {
        await this.room.sendChat(util.format(message, ...fmt), {
            side: MessageSide.Left
        });
    }
}

export type CmdCallback = (ctx: CmdContext) => Promise<void> | void;

interface CmdEntry {
    name: string;
    description: string;
    requiresAuth: boolean;
    callback: CmdCallback;
}

/**
 * Handler for Among Us vanilla /cmd chat commands.
 *
 * In Among Us, messages starting with "/cmd" from non-host players are
 * only sent to the host. In Waterway's SaaH mode, the server IS the host,
 * so the server receives and processes these commands.
 *
 * Supported commands:
 *   /cmd help          - Show available commands
 *   /cmd list          - List players in the room
 *   /cmd kick <player> - Kick a player from the room
 *   /cmd ban <player>  - Ban a player from the room
 *   /cmd room <name>   - Set the room name
 *   /cmd public        - Make the room public
 *   /cmd private       - Make the room private
 */
export class CmdHandler {
    private commands: Map<string, CmdEntry> = new Map();

    constructor(public readonly room: Room) {
        this.registerBuiltinCommands();
    }

    private registerBuiltinCommands(): void {
        this.register("help", "Show available commands", false, async (ctx) => {
            const available = [...this.commands.values()]
                .filter(c => !c.requiresAuth || ctx.room.getConnection(ctx.player)?.isAuthenticated);

            let out = "<color=#58a6ff>Available commands:</color>";
            for (const cmd of available) {
                out += `\n  /cmd ${cmd.name} — ${cmd.description}`;
            }
            await ctx.reply(out);
        });

        this.register("list", "List players in the room", false, async (ctx) => {
            const lines: string[] = [];
            for (const [, player] of ctx.room.players) {
                const conn = ctx.room.connections.get(player.clientId);
                const host = ctx.room.authorityId === player.clientId ? " [HOST]" : "";
                const auth = conn?.isAuthenticated ? ` (${conn.friendCode})` : "";
                const dead = player.getPlayerInfo()?.isDead ? " [DEAD]" : "";
                lines.push(`  ${player.username}${host}${auth}${dead}`);
            }
            const state = GameState[ctx.room.gameState] || "Unknown";
            const map = logMaps[ctx.room.settings.map] || GameMap[ctx.room.settings.map] || "Unknown";
            await ctx.reply(
                `<color=#58a6ff>Room ${ctx.room.code}</color> | ${ctx.room.players.size} players | ${state} | ${map}\n${lines.join("\n")}`
            );
        });

        this.register("kick", "Kick a player by name or ID. Usage: /cmd kick <player>", true, async (ctx) => {
            const targetName = ctx.args.join(" ");
            if (!targetName) {
                await ctx.reply("<color=red>Usage: /cmd kick <player name></color>");
                return;
            }

            const target = this.findPlayer(targetName);
            if (!target) {
                await ctx.reply("<color=red>Player not found: %s</color>", targetName);
                return;
            }

            const targetConn = ctx.room.getConnection(target);
            if (!targetConn) {
                await ctx.reply("<color=red>Cannot kick: player has no connection</color>");
                return;
            }

            await targetConn.disconnect(DisconnectReason.Kicked);
            await ctx.broadcast(
                "<color=orange>%s was kicked by %s</color>",
                target.username, ctx.player.username
            );
        });

        this.register("ban", "Ban a player by name or ID. Usage: /cmd ban <player>", true, async (ctx) => {
            const targetName = ctx.args.join(" ");
            if (!targetName) {
                await ctx.reply("<color=red>Usage: /cmd ban <player name></color>");
                return;
            }

            const target = this.findPlayer(targetName);
            if (!target) {
                await ctx.reply("<color=red>Player not found: %s</color>", targetName);
                return;
            }

            ctx.room.banPlayer(target);
            await ctx.broadcast(
                "<color=red>%s was banned by %s</color>",
                target.username, ctx.player.username
            );
        });

        this.register("room", "Set room name. Usage: /cmd room <name>", true, async (ctx) => {
            const name = ctx.args.join(" ");
            if (!name) {
                ctx.room.clearRoomNameOverride();
                await ctx.reply("Room name override cleared.");
                return;
            }
            ctx.room.setRoomNameOverride(name);
            await ctx.broadcast(
                "<color=#58a6ff>Room name set to: %s</color>", name
            );
        });

        this.register("public", "Make the room public", true, async (ctx) => {
            ctx.room.privacy = RoomPrivacy.Public;
            await ctx.broadcast("<color=#58a6ff>Room is now PUBLIC</color>");
        });

        this.register("private", "Make the room private", true, async (ctx) => {
            ctx.room.privacy = RoomPrivacy.Private;
            await ctx.broadcast("<color=#58a6ff>Room is now PRIVATE</color>");
        });
    }

    /**
     * Register a custom /cmd command.
     */
    register(name: string, description: string, requiresAuth: boolean, callback: CmdCallback): void {
        this.commands.set(name.toLowerCase(), {
            name: name.toLowerCase(),
            description,
            requiresAuth,
            callback,
        });
    }

    /**
     * Parse and execute a /cmd message.
     * @param message The full message after "/cmd " prefix
     */
    async handleMessage(player: Player<Room>, message: string): Promise<boolean> {
        const parts = this.splitArgs(message);
        const commandName = parts.shift()?.toLowerCase();

        if (!commandName) {
            // Just "/cmd" — show help
            const cmd = this.commands.get("help");
            if (cmd) {
                const ctx = new CmdContext(this.room, player, message, []);
                await cmd.callback(ctx);
            }
            return true;
        }

        const cmd = this.commands.get(commandName);
        if (!cmd) {
            await this.room.sendChat(
                `<color=red>Unknown command: /cmd ${commandName}. Use /cmd help for available commands.</color>`,
                { side: MessageSide.Left, targets: [player] }
            );
            return true;
        }

        if (cmd.requiresAuth) {
            const conn = this.room.getConnection(player);
            if (!conn?.isAuthenticated) {
                await this.room.sendChat(
                    "<color=red>You must be authenticated to use this command. Log in with your Among Us account first.</color>",
                    { side: MessageSide.Left, targets: [player] }
                );
                return true;
            }
        }

        const ctx = new CmdContext(this.room, player, message, parts);
        try {
            await cmd.callback(ctx);
        } catch (e) {
            ctx.room.logger.error("Error executing /cmd %s: %s", commandName, e);
            await ctx.reply("<color=red>Error executing command.</color>");
        }

        return true;
    }

    /**
     * Find a player by name (partial match) or client ID.
     */
    private findPlayer(query: string): Player<Room> | undefined {
        // Try exact client ID match
        const id = parseInt(query);
        if (!isNaN(id)) {
            return this.room.players.get(id);
        }

        // Try case-insensitive name match
        const lower = query.toLowerCase();
        for (const [, player] of this.room.players) {
            if (player.username.toLowerCase().includes(lower)) {
                return player;
            }
        }

        return undefined;
    }

    /**
     * Split a command string into arguments, respecting quoted strings.
     */
    private splitArgs(input: string): string[] {
        const args: string[] = [];
        let current = "";
        let inQuote = false;
        let quoteChar = "";

        for (let i = 0; i < input.length; i++) {
            const ch = input[i];
            if (!inQuote && (ch === '"' || ch === "'")) {
                inQuote = true;
                quoteChar = ch;
            } else if (inQuote && ch === quoteChar) {
                inQuote = false;
                quoteChar = "";
            } else if (!inQuote && ch === " ") {
                if (current) {
                    args.push(current);
                    current = "";
                }
            } else {
                current += ch;
            }
        }
        if (current) args.push(current);

        return args;
    }
}
