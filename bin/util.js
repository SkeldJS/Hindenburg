const child_process = require("child_process");
const chalk = require("chalk");

function runCommandInDir(dir, command) {
    return new Promise((resolve, reject) => {
        child_process.exec(command, {
            cwd: dir
        }, (err, stdout) => {
            if (err) {
                reject(err);
                return;
            }
            resolve(stdout);
        });
    });
}

const spinnerFrames = [ "|", "/", "-", "\\", "|", "/", "-", "\\" ];
function createSpinner(text) {
    let frame = 0;
    const interval = setInterval(() => {
        process.stdout.clearLine(1);
        process.stdout.cursorTo(0);
        process.stdout.write(text + " " + spinnerFrames[frame % spinnerFrames.length]);
        frame++;
    }, 100);
    return { text, interval };
}

function stopSpinner(spinner, success) {
    clearInterval(spinner.interval);
    process.stdout.clearLine(1);
    process.stdout.cursorTo(0);
    process.stdout.write(spinner.text + " " + (success ? chalk.green("✓") : chalk.red("❌")) + "\n");
}

module.exports = { runCommandInDir, createSpinner, stopSpinner };