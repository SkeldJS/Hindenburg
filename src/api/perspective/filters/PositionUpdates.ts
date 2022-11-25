import { CustomNetworkTransform } from "@skeldjs/core";
import { DataMessage, SnapToMessage } from "@skeldjs/protocol";
import { PacketContext, Perspective } from "../../../worker";

import { MessageFilter, MessageFilterDirection } from "../../hooks";
import { PerspectiveFilter } from "../PerspectiveFilter";

export class PositionUpdatesPerspectiveFilter extends PerspectiveFilter {
    @MessageFilter(DataMessage)
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    onDataMessage(message: DataMessage, perspective: Perspective, direction: MessageFilterDirection, context: PacketContext) {
        if (message.data.byteLength !== 10)
            return;

        const netobject = perspective.netobjects.get(message.netId);

        if (netobject instanceof CustomNetworkTransform) {
            message.cancel();
        }
    }

    @MessageFilter(SnapToMessage)
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    onSnapToMessage(message: SnapToMessage, perspective: Perspective, direction: MessageFilterDirection, context: PacketContext) {
        message.cancel();
    }
}
