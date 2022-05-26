import { GameKeyword, GameMap } from "@skeldjs/constant";
import { CancelableEvent } from "@skeldjs/events";
import { GameListing } from "@skeldjs/protocol";

import { Connection } from "../../../worker";

/**
 * Emitted when a connection enters the "public games" section and begins looking
 * for games. Can be used to fetch game listing sources from external sources,
 * just to return your own list of games, or cancel searching altogether.
 */
export class WorkerGetGameListEvent extends CancelableEvent {
    static eventName = "worker.getgamelist" as const;
    eventName = "worker.getgamelist" as const;

    private _alteredGames: GameListing[];

    constructor(
        /**
         * The client that is looking for a game.
         */
        public readonly client: Connection,
        /**
         * The chat language that returned rooms should be using.
         */
        public readonly chatLanguage: GameKeyword,
        /**
         * The map that returned rooms should be on.
         */
        public readonly gameMap: GameMap,
        /**
         * The number of impostors that should be used in the returned rooms.
         */
        public readonly numImpostors: number,
        /**
         * The rooms that will be returned back to the client, unless changed with
         * {@link WorkerGetGameListEvent.setGames}.
         */
        public readonly games: GameListing[]
    ) {
        super();

        this._alteredGames = games;
    }

    /**
     * The games that will be returned instead, if modified with {@link WorkerGetGameListEvent.setGames}.
     */
    get alteredGames() {
        return this._alteredGames;
    }

    /**
     * Change the games that will be returned back to the client.
     * @param games The games that should be returned instead.
     */
    setGames(games: GameListing[]) {
        this._alteredGames = games;
    }
}
