import { Int2Code } from "@skeldjs/util";

export function fmtCode(code: number) {
    return code === 0x20 ? "LOCAL" : Int2Code(code);
}
