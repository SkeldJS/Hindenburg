import { BasicEvent } from "@skeldjs/events";
import { Plugin } from "../../handlers";
import { WorkerEvents } from "../../Worker";

const hindenburgEventListenersKey = Symbol("hindenburg:events");

export interface PluginRegisteredEventListenerInfo {
    handler: (ev: BasicEvent) => any;
    eventName: string;
}

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
export function EventListener(eventName: string) :
    (
        target: any,
        propertyKey: string,
        descriptor: TypedPropertyDescriptor<
            (ev: any) => any
        >
    ) => any;
export function EventListener(pluginClass: typeof Plugin, eventName: string) :
    (
        target: any,
        propertyKey: string,
        descriptor: TypedPropertyDescriptor<
            (ev: any) => any
        >
    ) => any;
export function EventListener(pluginClassOrEventName: any, eventName?: any) {
    return function (
        target: any,
        propertyKey: string,
        descriptor: TypedPropertyDescriptor<
            (ev: BasicEvent) => any
        >
    ) {
        if (!descriptor.value)
            return;

        const actualTarget = typeof pluginClassOrEventName === "string"
            ? target
            : pluginClassOrEventName.prototype;

        const cachedSet: PluginRegisteredEventListenerInfo[]|undefined = Reflect.getMetadata(hindenburgEventListenersKey, actualTarget);
        const eventListeners = cachedSet || [];
        if (!cachedSet) {
            Reflect.defineMetadata(hindenburgEventListenersKey, eventListeners, actualTarget);
        }

        eventListeners.push({
            handler: descriptor.value,
            eventName: eventName || pluginClassOrEventName
        });
    };
}

export function getPluginEventListeners(pluginCtr: typeof Plugin|Plugin): PluginRegisteredEventListenerInfo[] {
    return Reflect.getMetadata(hindenburgEventListenersKey, pluginCtr) || [];
}
