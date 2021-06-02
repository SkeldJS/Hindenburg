import path from "path";
import fs from "fs/promises";
import child_process from "child_process";
import winston from "winston";

import { MessageOpcode } from "./MessageOpcode";

const logger = winston.createLogger({
    transports: [
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.splat(),
                winston.format.colorize(),
                winston.format.label({ label: "Cluster" }),
                winston.format.printf(info => {
                    return `[${info.label}] ${info.level}: ${info.message}`;
                })
            ),
        }),
        new winston.transports.File({
            filename: "logs.txt",
            format: winston.format.combine(
                winston.format.splat(),
                winston.format.simple()
            )
        })
    ]
});


export class ClusterNode {
    process!: child_process.ChildProcess;

    constructor(
        public id: string,
        public cluster_name: string
    ) {}

    start() {
        this.process = child_process.fork(
            path.resolve(__dirname, "./worker"),
            {
                env: {
                    NODE_ID: this.id,
                    CLUSTER_NAME: this.cluster_name
                },
                stdio: [ "inherit", "inherit", "inherit", "ipc" ]
            }
        );

        return new Promise<void>(resolve => {
            const proc = this.process;
            this.process.on("message", function onMessage(message: MessageOpcode) {
                if (message === MessageOpcode.Ready) {
                    resolve();
                    proc.off("message", onMessage);
                }
            });
        });
    }

    shutdown() {
        return new Promise<void>(resolve => {
            this.process.send(MessageOpcode.Shutdown);

            const proc = this.process;
            this.process.on("message", function onMessage(message: MessageOpcode) {
                if (message === MessageOpcode.ShutdownDone) {
                    resolve();
                    proc.off("message", onMessage);
                    proc.kill(0);
                }
            });
        });
    }
}

(async () => {
    const config = JSON.parse(await fs.readFile(path.resolve(process.cwd(), "./config.json"), "utf8"));

    const nodes: ClusterNode[] = [];

    await Promise.all(
        config.cluster.ports.map((port: string, i: number) => {
            const node = new ClusterNode(i.toString(), config.cluster.name);
            nodes.push(node);
            logger.info("Starting node #%s..", i);

            return node.start().then(() => logger.info("Node #%s ready.", i))
        })
    );

    setInterval(() => {}, 10);

    process.stdin.setRawMode(true);
    process.stdin.on("data", async buffer => {
        if (buffer[0] === 0x03 /* ctrl+c */) {
            logger.info("Shutting down %s nodes..", nodes.length);
            await Promise.all(
                nodes.map(node => {
                    logger.info("Shutting down #%s..", node.id);
                    return node.shutdown();
                })
            );
            process.exit(0);
        }
    });
})();