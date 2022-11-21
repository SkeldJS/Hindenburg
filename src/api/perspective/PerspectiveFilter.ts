import { Deserializable, Serializable } from "@skeldjs/protocol";
import { MessageFilterCallback } from "../hooks";

export class PerspectiveFilter {
    private loadedFilters: {
        messageClass: Deserializable;
        filter: MessageFilterCallback<Serializable>;
    }[];

    constructor() {
        this.loadedFilters = [];
    }

    getFilters() {
        return this.loadedFilters;
    }
}
