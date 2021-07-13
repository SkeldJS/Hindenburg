/**
 * @returns {HindenburgConfig}
 */
function createDefault() {
    return {
        $schema: "./misc/config.schema.json",
        versions: ["2021.6.30"],
        clusterName: "Capybara",
        nodeId: 0,
        socket: {
            port: 22023
        },
        plugins: {},
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
        logging: {},
        reactor: {
            blockClientSideOnly: true
        }
    };
}
module.exports = { createDefault };