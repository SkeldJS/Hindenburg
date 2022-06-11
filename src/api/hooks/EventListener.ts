import { BasicEvent } from "@skeldjs/events";
import { Plugin, SomePluginCtr } from "../../handlers";
import { WorkerEvents } from "../../worker";
import { MethodDecorator } from "../types";

const hindenburgEventListenersKey = Symbol("hindenburg:events");

export interface PluginRegisteredEventListenerInfo {
    handler: (ev: BasicEvent) => any;
    eventName: string;
}

/**
 * A decorator to attach to a method to create a listener for an event that gets
 * emitted on the server or a room.
 * @param eventName The name of the event to listen for.
 */
export function EventListener<EventName extends keyof WorkerEvents>(eventName: EventName): MethodDecorator<(ev: WorkerEvents[EventName]) => any>;
/**
 * A decorator to attach to a method to create a listener for an event that gets
 * emitted on the server or a room.
 * @param pluginClass The class of the plugin to create a listener for.
 * @param eventName The name of the event to listen for.
 */
export function EventListener<EventName extends keyof WorkerEvents>(pluginClass: SomePluginCtr, eventName: EventName): MethodDecorator<(ev: WorkerEvents[EventName]) => any>;
/**
 * A decorator to attach to a method to create a listener for an event that gets
 * emitted on the server, a room or another plugin.
 * @param eventName The name of the event to listen for.
 */
export function EventListener(eventName: string): MethodDecorator<(ev: any) => any>;
/**
 * A decorator to attach to a method to create a listener for an event that gets
 * emitted on the server, a room or another plugin.
 * @param pluginClass The class of the plugin to create a listener for.
 * @param eventName The name of the event to listen for.
 */
export function EventListener(pluginClass: SomePluginCtr, eventName: string): MethodDecorator<(ev: any) => any>;
/**
 * A decorator to attach to a method to create a listener for an event that gets
 * emitted on the server, a room or another plugin. This can only be used if you're
 * writing your plugin in TypeScript, where the method this is attached to can emit
 * type metadata, given that you pass in the type of the event to listen for.
 * @example
 * ```ts
 * .@EventListener()
 * onPlayerSetColor(ev: PlayerSetColorEvent<Room>) {
 *     this.logger.info("Player %s set their color to %s",
 *         ev.player, Color[ev.newColor]);
 * }
 * ```
 */
export function EventListener(): MethodDecorator<(ev: any) => any>;
/**
 * A decorator to attach to a method to create a listener for an event that gets
 * emitted on the server, a room or another plugin. This can only be used if you're
 * writing your plugin in TypeScript, where the method this is attached to can emit
 * type metadata, given that you pass in the type of the event to listen for.
 * @example
 * ```ts
 * .@EventListener()
 * onPlayerSetColor(FunThingsPlugin, ev: PlayerSetColorEvent<Room>) {
 *     this.logger.info("Player %s set their color to %s",
 *         ev.player, Color[ev.newColor]);
 * }
 * ```
 */
export function EventListener(pluginClass: SomePluginCtr): MethodDecorator<(ev: any) => any>;
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
