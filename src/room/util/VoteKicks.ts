import { Player } from "../Player";

export class VoteKicks {
    dirty: boolean;
    votes: Map<Player, Set<Player>>;

    constructor() {
        this.dirty = false;
        this.votes = new Map;
    }

    /**
     * Add a vote from a player to kick someone else.
     * @param voter The voter to add.
     * @param target Who to vote kick.
     * @example
     * ```ts
     * // Make the 
     * ```
     */
    addVote(voter: Player, target: Player) {
        const votesFor = this.getVotesFor(target);
        votesFor.add(voter);
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