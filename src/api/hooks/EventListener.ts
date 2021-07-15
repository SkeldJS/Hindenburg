import { Plugin } from "../../handlers";
import { WorkerEvents } from "../../Worker";

export const hindenburgEventListenersKey = Symbol("hindenburg:events");

export function EventListener<EventName extends keyof WorkerEvents>(eventName: EventName) : 
    (
        target: any,
        propertyKey: string,
        descriptor: TypedPropertyDescriptor<
            (ev: WorkerEvents[EventName]) => any
        >
    ) => any;
export function EventListener<EventName extends keyof WorkerEvents>(pluginClass: typeof Plugin, eventName: EventName) :
    (
        target: any,
        propertyKey: string,
        descriptor: TypedPropertyDescriptor<
            (ev: WorkerEvents[EventName]) => any
        >
    ) => any;
export function EventListener<EventName extends keyof WorkerEvents>(pluginClassOrEventName: any, eventName?: any) {
    return function (
        target: any,
        propertyKey: string,
        descriptor: TypedPropertyDescriptor<
            (ev: WorkerEvents[EventName]) => any
        >
    ) {
        const actualTarget = typeof pluginClassOrEventName === "string"
            ? target
            : pluginClassOrEventName.prototype;

        const cachedSet = Reflect.getMetadata(hindenburgEventListenersKey, actualTarget);
        const messagesToRegister = cachedSet || new Set;
        if (!cachedSet) {
            Reflect.defineMetadata(hindenburgEventListenersKey, messagesToRegister, actualTarget);
        }
        
        messagesToRegister.add({
            handler: descriptor.value!,
            eventName: eventName || pluginClassOrEventName
        });
    }
}