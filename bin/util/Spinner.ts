import readline from "readline";
import chalk from "chalk";

const spinnerFrames = [ "|", "/", "-", "\\", "|", "/", "-", "\\" ];

export class Spinner {
    private _interval?: NodeJS.Timeout;
    private frame: number;

    constructor(
        public readonly message: string
    ) {
        this.frame = 0;
    }

    private reset() {
        readline.clearLine(process.stdout, 1);
        readline.cursorTo(process.stdout, 0);
    }

    start() {
        this._interval = setInterval(() => {
            this.reset();
            process.stdout.write(this.message.replace("%s", spinnerFrames[this.frame % spinnerFrames.length]));
            this.frame++;
        }, 100);
        return this;
    }

    stop(wasSuccessful: boolean) {
        clearInterval(this._interval!);
        this.reset();
        process.stdout.write(this.message.replace("%s", wasSuccessful ? chalk.green("✓") : chalk.red("❌")) + "\n");
        return this;
    }

    success() {
        return this.stop(true);
    }

    fail() {
        return this.stop(true);
    }

    isSpinning() {
        return !!this._interval;
    }
}
