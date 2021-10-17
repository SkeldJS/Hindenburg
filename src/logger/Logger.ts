import util from "util";
import fs from "fs";

import chalk from "chalk";
import vorpal from "vorpal";

export class Logger {
    public fileStream?: fs.WriteStream;

    constructor(
        private readonly label?: string|(() => string),
        private readonly vorpal?: vorpal
    ) {}

    getLabel() {
        if (!this.label)
            return "";

        return typeof this.label === "string"
            ? this.label
            : this.label();
    }

    private _log(prefix: string, message: string, ...fmt: any[]) {
        const consoleFormatted = (this.getLabel()
            ? "[" + this.getLabel() + "] "
            : "") + prefix + ": " + util.format(message, ...fmt);

        if (this.fileStream) {
            // eslint-disable-next-line no-control-regex
            const strippedFormatted = consoleFormatted.replace(/\x1b\[\d+m/g, "");
            this.fileStream.write("[" + new Date().toISOString() + "] " + strippedFormatted);
        }

        if (this.vorpal) {
            this.vorpal.log(consoleFormatted);
        } else {
            process.stdout.write(consoleFormatted + "\n");
        }
    }

    error(message: string, ...fmt: any[]) {
        this._log(chalk.red("error"), message, ...fmt);
    }

    debug(message: string, ...fmt: any[]) {
        this._log(chalk.grey("debug"), message, ...fmt);
    }

    warn(message: string, ...fmt: any[]) {
        this._log(chalk.yellow("warn"), message, ...fmt);
    }

    data(message: string, ...fmt: any[]) {
        this._log(chalk.magenta("data"), message, ...fmt);
    }

    info(message: string, ...fmt: any[]) {
        this._log(chalk.green("info"), message, ...fmt);
    }
}
