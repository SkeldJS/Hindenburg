import { AddVoteMessage, RpcMessage } from "@skeldjs/protocol";
import { Player } from "../Player";
import { Room } from "../Room";

export class VoteKicks {
    dirty: boolean;
    votes: Map<Player, Set<Player>>;

    constructor(
        public readonly room: Room
    ) {
        this.dirty = false;
        this.votes = new Map;
    }

    /**
     * Add a vote from a player to kick someone else.
     * @param voter The voter to add.
     * @param target The player to vote kick.
     * @example
     * ```ts
     * // Make everyone vote kick ForteBass.
     * const forte = room.players.getPlayerByName("ForteBass");
     * 
     * if (!forte)
     *   return;
     * 
     * for (const [ clientId, player ] of room.players) {
     *   if (player === forte)
     *     continue;
     * 
     *   room.voteKicks.addVote(player, forte);
     * }
     * ```
     */
    addVote(voter: Player, target: Player) {
        if (!this.room.components.voteBanSystem)
            throw new Error("The VoteBanSystem object has not been spawned.");

        const votesFor = this.getVotesFor(target);
        votesFor.add(voter);
        this.room.gamedataStream.push(
            new RpcMessage(
                this.room.components.voteBanSystem.netid,
                new AddVoteMessage(
                    voter.clientId,
                    target.clientId
                )
            )
        );
        this.dirty = true;
    }

    /**
     * Get all players who voted for a specified player.
     * @param player The player to get votes for.
     */
    getVotesFor(player: Player): Set<Player> {
        const votes = this.votes.get(player);
        if (!votes) {
            const newVotes: Set<Player> = new Set;
            this.votes.set(player, newVotes);
            return newVotes;
        }
        return  votes;
    }

    /**
     * Get all players that a specified player has voted for.
     * @param player The player to get votes for.
     */
    getVoted(player: Player) {
        const players = [];
        for (const [ voted, voters ] of this.votes) {
            if (voters.has(player)) {
                players.push(voted);
            }
        }
        return players;
    }
}