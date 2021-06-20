import { WorkerEvents } from "../../Worker";

export const hindenburgEventKey = Symbol("hindenburg:event");

export function EventListener<EventName extends keyof WorkerEvents>(eventName: EventName) {
    return function (
        target: any,
        propertyKey: string,
        descriptor: TypedPropertyDescriptor<
            (ev: WorkerEvents[EventName]) => any
        >
    ) {
        Reflect.defineMetadata(hindenburgEventKey, eventName, target, propertyKey);
    }
}