import { Hostable, HostableEvents, PlayerData, RoomFixedUpdateEvent } from "@skeldjs/core";
import { BasicEvent } from "@skeldjs/events";
import { BaseGameDataMessage, BaseRootMessage, DataMessage } from "@skeldjs/protocol";
import { HazelWriter } from "@skeldjs/util";
import { Lobby } from "./Lobby";

export class Room extends Hostable {
    constructor(
        private readonly lobby: Lobby
    ) {
        super();
    }

    async emit<Event extends HostableEvents[keyof HostableEvents]>(
        event: Event
    ): Promise<Event>;
    async emit<Event extends BasicEvent>(event: Event): Promise<Event>;
    async emit<Event extends BasicEvent>(event: Event): Promise<Event> {
        await this.lobby.emit(event);

        return super.emit(event);
    }

    async broadcast(
        messages: BaseGameDataMessage[],
        reliable: boolean = true,
        recipient: PlayerData | undefined = undefined,
        payloads: BaseRootMessage[] = []
    ) {
        const recipientConnection = recipient
            ? this.lobby.connections.get(recipient.id)
            : undefined;
            
        return this.lobby.broadcastMessages(messages, payloads, recipientConnection ? [recipientConnection] : undefined);
    }

    async FixedUpdate() {
        const delta = Date.now() - (this as any).last_fixed_update;
        (this as any).last_fixed_update = Date.now();
        for (const [, component] of this.room.netobjects) {
            if (
                component
            ) {
                component.FixedUpdate(delta / 1000);
                if (component.dirtyBit) {
                    component.PreSerialize();
                    const writer = HazelWriter.alloc(0);
                    if (component.Serialize(writer, false)) {
                        this.room.stream.push(
                            new DataMessage(component.netid, writer.buffer)
                        );
                    }
                    component.dirtyBit = 0;
                }
            }
        }

        const ev = await this.emit(
            new RoomFixedUpdateEvent(
                this.room,
                this.room.stream
            )
        );

        if (this.room.stream.length) {
            const stream = this.room.stream;
            this.room.stream = [];

            if (!ev.canceled) await this.broadcast(stream);
        }
    }
}