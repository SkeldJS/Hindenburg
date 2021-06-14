import { Plugin, PluginMeta } from "../PluginLoader";
import { Worker, WorkerEvents } from "../Worker";

export function HindenburgPlugin(meta: PluginMeta) {
    return function<T extends { new(...args: any): {} }>(constructor: T) {
        return class extends constructor implements Plugin {
            static id = meta.id;

            worker: Worker;
            config: any;
            
            meta: PluginMeta;

            eventListeners: [keyof WorkerEvents, (ev: WorkerEvents[keyof WorkerEvents]) => any][];
    
            constructor(...args: any) {
                super(...args);
    
                this.worker = args[0] as Worker;
                this.config = args[1] as any;

                this.meta = meta;

                this.eventListeners = [];
            }
        }
    }
}