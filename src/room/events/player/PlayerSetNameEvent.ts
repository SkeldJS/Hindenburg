import { RevertableEvent } from "@skeldjs/events";
import { SetNameMessage } from "@skeldjs/protocol";
import { Player } from "../../Player";
import { Room } from "../../Room";
import { RoomEvent } from "../RoomEvent";
import { RpcEvent } from "../RpcEvent";
import { PlayerEvent } from "./PlayerEvent";

export class PlayerSetNameEvent extends RevertableEvent implements RoomEvent, PlayerEvent, RpcEvent {
    static eventName = "player.setname";
    eventName = "player.setname";

    alteredName: string;

    constructor(
        public readonly room: Room,
        public readonly player: Player,
        public readonly rpc: SetNameMessage,
        public readonly oldName: string,
        public readonly name: string
    ) {
        super();

        this.alteredName = name;
    }

    setName(name: string) {
        this.alteredName = name;
    }
}