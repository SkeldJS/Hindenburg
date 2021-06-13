import { Room } from "../Room";

export interface RoomEvent {
    /**
     * The room that this event came from.
     */
    room: Room;
}