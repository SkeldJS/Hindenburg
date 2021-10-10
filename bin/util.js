const child_process = require("child_process");
const chalk = require("chalk");
const readline = require("readline");

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
    const perSecond = 10;
    const interval = setInterval(() => {
        readline.clearLine(process.stdout, 1);
        readline.cursorTo(process.stdout, 0);
        process.stdout.write(text + " " + spinnerFrames[frame % spinnerFrames.length]);
        if (frame > perSecond * 5) {
            process.stdout.write(" (" + (frame / (perSecond)).toFixed(1) + "s)");
        }
        frame++;
    }, 1000 / perSecond);
    return { text, interval };
}

function stopSpinner(spinner, success) {
    clearInterval(spinner.interval);
    readline.clearLine(process.stdout, 1);
    readline.cursorTo(process.stdout, 0);
    process.stdout.write(spinner.text + " " + (success ? chalk.green("✓") : chalk.red("❌")) + "\n");
}

/**
 * @returns {HindenburgConfig}
 */
function createDefaultConfig() {
    return {
        $schema: "./misc/config.schema.json",
        versions: ["2021.6.30"],
        clusterName: "Capybara",
        nodeId: 0,
        checkForUpdates: true,
        socket: {
            port: 22023,
            broadcastUnknownGamedata: false,
            messageOrdering: false,
            ip: "auto"
        },
        plugins: {
            loadDirectory: true
        },
        anticheat: {
            penalty: {
                action: "disconnect",
                strikes: 2,
                banAfterXDisconnects: 3,
                banDuration: 3600,
                disconnectMessage: "You have been banned for $duration."
            },
            rules: {}
        },
        logging: {
            hideSensitiveInfo: false,
            connections: {
                format: ["id", "ip", "ping", "room"]
            },
            rooms: {
                format: ["players", "map"]
            },
            players: {
                format: ["id", "ping", "ishost"]
            }
        },
        reactor: {
            blockClientSideOnly: true,
            mods: {},
            allowExtraMods: true,
            requireHostMods: true
        },
        rooms: {
            chatCommands: true,
            plugins: {},
            gameCodes: "v2"
        },
        exitConfirmation: true
    };
}

module.exports = { runCommandInDir, createSpinner, stopSpinner, createDefaultConfig };
