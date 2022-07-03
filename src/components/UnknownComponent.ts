import { Hostable, Networkable, SpawnType } from "@skeldjs/core";
import { HazelReader } from "@skeldjs/util";

export class UnknownComponent<RoomType extends Hostable> extends Networkable<RoomType> {
    constructor(
        room: RoomType,
        spawnType: SpawnType,
        netId: number,
        ownerId: number,
        flags: number,
        data?: HazelReader | any
    ) {
        super(room, spawnType, netId, ownerId, flags, data);
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/no-empty-function
    Deserialize() {}
    // eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/no-empty-function
    Serialize(): boolean {
        throw new Error("Cannot serialize unknown component; (you might need to disable Server-as-a-Host)");
    }
}
