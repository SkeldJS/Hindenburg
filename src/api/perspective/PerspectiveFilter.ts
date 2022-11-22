import { Deserializable, MessageListener, Serializable } from "@skeldjs/protocol";
import { PacketContext } from "../../worker";

export class PerspectiveFilter {
    private loadedFilters: {
        messageClass: Deserializable;
        handler: MessageListener<Serializable, PacketContext>;
    }[];

    constructor() {
        this.loadedFilters = [];
    }

    getFilters() {
        return this.loadedFilters;
    }
}
