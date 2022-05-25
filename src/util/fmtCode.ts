import { GameCode } from "@skeldjs/util";

export function fmtCode(code: number) {
    return code === 0x20 ? "LOCAL" : GameCode.convertIntToString(code);
}
