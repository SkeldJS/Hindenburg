import { BasicEvent } from "@skeldjs/events";
import { Plugin, RoomPlugin, WorkerPlugin } from "../../handlers";
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
export function EventListener<EventName extends keyof WorkerEvents>(pluginClass: typeof WorkerPlugin|typeof RoomPlugin, eventName: EventName) :
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
export function EventListener(pluginClass: typeof WorkerPlugin|typeof RoomPlugin, eventName: string) :
    (
        target: any,
        propertyKey: string,
        descriptor: TypedPropertyDescriptor<
            (ev: any) => any
        >
    ) => any;
export function EventListener() :
    (
        target: any,
        propertyKey: string,
        descriptor: TypedPropertyDescriptor<
            (ev: any) => any
        >
    ) => any;
export function EventListener(pluginClass: typeof WorkerPlugin|typeof RoomPlugin) :
    (
        target: any,
        propertyKey: string,
        descriptor: TypedPropertyDescriptor<
            (ev: any) => any
        >
    ) => any;
export function EventListener(pluginClassOrEventName?: any, eventName?: any) {
    return function (
        target: any,
        propertyKey: string,
        descriptor: TypedPropertyDescriptor<
            (ev: BasicEvent) => any
        >
    ) {
        if (!descriptor.value)
            return;

        const actualTarget = typeof pluginClassOrEventName === "function"
            ? pluginClassOrEventName.prototype
            : target;

        const paramType = Reflect.getMetadata("design:paramtypes", target, propertyKey)?.[0] as typeof BasicEvent|undefined;
        const actualEventName = paramType?.eventName || eventName || pluginClassOrEventName;

        if (!actualEventName) {
            throw new Error("No event name passed for event emitter, if you're in typescript, make sure 'emitDecoratorMetadata' is enabled in your tsconfig.json");
        }

        const cachedSet: PluginRegisteredEventListenerInfo[]|undefined = Reflect.getMetadata(hindenburgEventListenersKey, actualTarget);
        const eventListeners = cachedSet || [];
        if (!cachedSet) {
            Reflect.defineMetadata(hindenburgEventListenersKey, eventListeners, actualTarget);
        }

        eventListeners.push({
            handler: descriptor.value,
            eventName: actualEventName
        });
    };
}

export function getPluginEventListeners(pluginCtr: typeof Plugin|Plugin): PluginRegisteredEventListenerInfo[] {
    return Reflect.getMetadata(hindenburgEventListenersKey, pluginCtr) || [];
}
