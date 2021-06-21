import { Room } from "../../room";

export interface RoomEvent {
    /**
     * The room that this event came from.
     */
    room: Room;
}