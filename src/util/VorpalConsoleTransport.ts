import Vorpal from "vorpal";
import WinstonTransport from "winston-transport";

import { MESSAGE } from "triple-beam";

export class VorpalConsole extends WinstonTransport {
    constructor(
        public readonly vorpal: Vorpal,
        public readonly options: WinstonTransport.TransportStreamOptions
    ) {
        super(options);
    }

    log(info: any, callback: () => void) {
        setImmediate(() => this.emit('logged', info));

        this.vorpal.log(info[MESSAGE]);
    
        if (callback) {
            callback();
        }
    }
}