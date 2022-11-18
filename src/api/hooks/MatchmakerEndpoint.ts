import koa from "koa";
import { Plugin } from "../../handlers";
import { MethodDecorator } from "../types";

const hindenburgMatchmakerEndpointsKey = Symbol("hindenburg:matchmakerendpoints");

export type HttpMethod = "get"|"post"|"put"|"patch"|"delete";

export interface PluginRegisteredMatchmakerEndpoint {
    method: HttpMethod;
    route: string;
    body: (ctx: koa.Context) => any;
}

function RegisterMatchmakerEndpoint(method: HttpMethod, route: string) {
    return function (target: any, propertyKey: string, descriptor: TypedPropertyDescriptor<(ctx: koa.Context) => any>) {
        const cachedEndpoints: PluginRegisteredMatchmakerEndpoint[] = Reflect.getMetadata(hindenburgMatchmakerEndpointsKey, target);
        const endpoints = cachedEndpoints || [];
        if (!cachedEndpoints)
            Reflect.defineMetadata(hindenburgMatchmakerEndpointsKey, endpoints, target);

        endpoints.push({
            method,
            route,
            body: descriptor.value!
        });
    };
}

export function getPluginMatchmakerEndpoints(target: typeof Plugin|Plugin): PluginRegisteredMatchmakerEndpoint[] {
    return Reflect.getMetadata(hindenburgMatchmakerEndpointsKey, target) || [];
}

export class MatchmakerEndpoint {
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    private constructor() {}

    static Get(route: string): MethodDecorator<(ctx: koa.Context) => any> {
        return RegisterMatchmakerEndpoint("get", route);
    }

    static Post(route: string): MethodDecorator<(ctx: koa.Context) => any> {
        return RegisterMatchmakerEndpoint("post", route);
    }

    static Put(route: string): MethodDecorator<(ctx: koa.Context) => any> {
        return RegisterMatchmakerEndpoint("put", route);
    }

    static Patch(route: string): MethodDecorator<(ctx: koa.Context) => any> {
        return RegisterMatchmakerEndpoint("patch", route);
    }

    static Delete(route: string): MethodDecorator<(ctx: koa.Context) => any> {
        return RegisterMatchmakerEndpoint("delete", route);
    }
}
