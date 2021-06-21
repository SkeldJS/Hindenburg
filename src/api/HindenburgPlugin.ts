import winston from "winston";
import chalk from "chalk";
import vorpal from "vorpal";

import { Deserializable, Serializable } from "@skeldjs/protocol";

import { VorpalConsole } from "../util/VorpalConsoleTransport";
import { Plugin, PluginMeta } from "../handlers/PluginHandler";
import { Worker, WorkerEvents } from "../Worker";

export function HindenburgPlugin(meta: PluginMeta) {
    return function<T extends { new(...args: any): {} }>(constructor: T) {
        return class extends constructor implements Plugin {
            static id = meta.id;

            logger: winston.Logger;
            worker: Worker;
            config: any;
            
            meta: PluginMeta;

            eventHandlers: [keyof WorkerEvents, (ev: WorkerEvents[keyof WorkerEvents]) => any][];
            chatCommandHandlers: string[];
            messageHandlers: [Deserializable, (ev: Serializable) => any][]
            registeredMessages: Map<string, Map<number, Deserializable>>;
            registeredVorpalCommands: vorpal.Command[];
    
            constructor(...args: any) {
                super(...args);
                
                this.worker = args[0] as Worker;
                this.config = args[1] as any;

                this.logger = winston.createLogger({
                    transports: [
                        new VorpalConsole(this.worker.vorpal, {
                            format: winston.format.combine(
                                winston.format.splat(),
                                winston.format.colorize(),
                                winston.format.printf(info => {
                                    return `[${chalk.green(this.meta.id)}] ${info.level}: ${info.message}`;
                                }),
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
    
                this.meta = meta;
                
                this.eventHandlers = [];
                this.chatCommandHandlers = [];
                this.messageHandlers = [];
                this.registeredMessages = new Map;
                this.registeredVorpalCommands = [];
            }
        }
    }
}