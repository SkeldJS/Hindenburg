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
            broadcastUnknownGamedata: false
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
            gameCodes: "v1"
        }
    };
}

module.exports = { runCommandInDir, createSpinner, stopSpinner, createDefaultConfig };
