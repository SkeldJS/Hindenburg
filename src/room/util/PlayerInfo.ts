import { Color, Hat, Pet, Skin } from "@skeldjs/constant";
import { HazelReader, HazelWriter } from "@skeldjs/util";

export interface PlayerTaskState {
    taskIdx: number;
    isCompleted: boolean;
}

export class PlayerInfo {
    dirty: boolean;

    constructor(
        public readonly playerId: number,
        /**
         * The name that this player has assigned.
         * 
         * Not necessarily the same as {@link Connection.username}, although it
         * would be a sign of a modded/hacked client if it were not.
         */
        public name: string = "",
        public color: Color = -1,
        public hat: Hat = Hat.None,
        public pet: Pet = Pet.None,
        public skin: Skin = Skin.None,
        public flags: number = 0,
        public tasks: PlayerTaskState[] = []
    ) {
        this.dirty = true;
    }

    static Deserialize(reader: HazelReader, playerId: number) {
        const playerInfo = new PlayerInfo(playerId);
        playerInfo.Deserialize(reader);
        return playerInfo;
    }

    Deserialize(reader: HazelReader) {
        this.name = reader.string();
        this.color = reader.packed();
        this.hat = reader.upacked();
        this.pet = reader.upacked();
        this.skin = reader.upacked();
        this.flags = reader.byte();
        
        const numTasks = reader.uint8();
        this.tasks = reader.list(numTasks, reader => {
            const taskIdx = reader.upacked();
            const isCompleted = reader.bool();
    
            return { taskIdx, isCompleted };
        });
    }

    Serialize(writer: HazelWriter) {
        writer.string(this.name);
        writer.packed(this.color);
        writer.upacked(this.hat);
        writer.upacked(this.pet);
        writer.upacked(this.skin);
        writer.byte(this.flags);

        writer.uint8(this.tasks.length);
        writer.list(true, this.tasks, task => {
            writer.upacked(task.taskIdx);
            writer.bool(task.isCompleted);
        });
    }
}