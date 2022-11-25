import { SyncSettingsMessage } from "@skeldjs/protocol";
import { PacketContext, Perspective } from "../../../worker";

import { MessageFilter, MessageFilterDirection } from "../../hooks";
import { PerspectiveFilter } from "../PerspectiveFilter";

export class SettingsUpdatesPerspectiveFilter extends PerspectiveFilter {
    @MessageFilter(SyncSettingsMessage)
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    onDataMessage(message: SyncSettingsMessage, perspective: Perspective, direction: MessageFilterDirection, context: PacketContext) {
        message.cancel();
    }
}
