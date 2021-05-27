import { HostableEvents } from "@skeldjs/core";

import { ClientEvents } from "../../Client";
import { LoadBalancerNodeEvents } from "../../LoadBalancerNode";
import { MatchmakerNodeEvents } from "../../MatchmakerNode";
import { WorkerNodeEvents } from "../../WorkerNode";

export type GlobalEvents =
    LoadBalancerNodeEvents
    & WorkerNodeEvents
    & MatchmakerNodeEvents
    & ClientEvents
    & HostableEvents;

export const EventHandlers = Symbol("EventHandlers");

export type GlobalEventListener<key extends keyof GlobalEvents = keyof GlobalEvents> = (ev: GlobalEvents[key]) => any;

export function OnEvent<T extends keyof GlobalEvents>(eventName: T) {
    return function (target: any, propertyName: string, descriptor: TypedPropertyDescriptor<GlobalEventListener<T>>) {
        target[EventHandlers] ||= new Map;

        let gotListeners: Set<string> = target[EventHandlers].get(eventName);

        if (!gotListeners) {
            gotListeners = new Set;
            target[EventHandlers].set(eventName, gotListeners);
        }

        gotListeners.add(propertyName);
    }
}