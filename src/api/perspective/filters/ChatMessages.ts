import { SendChatMessage } from "@skeldjs/protocol";
import { PacketContext, Perspective } from "../../../worker";

import { MessageFilter, MessageFilterDirection } from "../../hooks";
import { PerspectiveFilter } from "../PerspectiveFilter";

export class ChatMessagesPerspectiveFilter extends PerspectiveFilter {
    @MessageFilter(SendChatMessage)
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    onDataMessage(message: SendChatMessage, perspective: Perspective, direction: MessageFilterDirection, context: PacketContext) {
        message.cancel();
    }
}
