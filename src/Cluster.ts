import child_process from "child_process";
import winston from "winston";

import path from "path";

const is_tsnode = !!process.argv[0].includes("ts-node");

export class ClusterNode {
    port: number;
    id: number;
    process!: child_process.ChildProcess;

    constructor(
        port: number,
        id: number
    ) {
        this.port = port;
        this.id = id;
    }

    start() {
        return new Promise<void>(resolve => {
            if (is_tsnode) {
                this.process = child_process.spawn(
                    "node",
                    [
                        process.argv[0],
                        path.resolve(__dirname, "../bin/node"),
                    ],
                    {
                        env: {
                            PORT: this.port.toString(),
                            NODE_ID: this.id.toString()
                        },
                        stdio: ["inherit", "inherit", "inherit", "ipc"],
                        cwd: process.cwd()
                    }
                );
            } else {
                this.process = child_process.spawn(
                    "node",
                    [
                        path.resolve(__dirname, "../bin/node"),
                    ],
                    {
                        env: {
                            PORT: this.port.toString(),
                            NODE_ID: this.id.toString()
                        },
                        stdio: ["inherit", "inherit", "inherit", "ipc"],
                        cwd: process.cwd()
                    }
                );
            }
    
            this.process.on("message", message => {
                if (message === "ready") {
                    resolve();
                }
            });
        });
    }

    shutdown() {
        return new Promise<void>(resolve => {
            this.process.kill("SIGINT");

            this.process.once("exit", () => {
                resolve();
            });
        });
    }
}

export class Cluster {
    logger: winston.Logger;
    nodes: ClusterNode[];

    constructor() {
        this.logger = winston.createLogger({
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

        this.nodes = [];
    }

    async start(ports: number[]) {
        this.logger.info("Starting %s node(s)..", ports.length);

        for (let i = 0; i < ports.length; i++) {
            const port = ports[i];

            (async () => {
                this.logger.info("Starting node %s..", i);
                const node = new ClusterNode(port, i);
                await node.start();
                this.logger.info("Node %s ready.", i);
            })();
        }
    }

    async gracefulShutdown() {
        for (const node of this.nodes) {
            this.logger.info("Shutting down node %s..");
            await node.shutdown();
        }
    }
}