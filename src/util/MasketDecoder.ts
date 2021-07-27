import { PacketDecoder } from "@skeldjs/protocol";

/**
 * A mask of a packet decoder to allow registered messages to be accessable
 * across all packet decoders rather than just the one they were registered in.
 * 
 * Indeed, "Masket" is a bad pun for packet and mask.
 */
export class MasketDecoder extends PacketDecoder {
    constructor(
        public readonly mask: PacketDecoder
    ) {
        super();

        this.types = mask.types;
    }
}