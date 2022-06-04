import polka from "polka";
import { Plugin } from "../../handlers";

const hindenburgHttpEndpointsKey = Symbol("hindenburg:httpendpoints");

export type HttpMethod = "get"|"post"|"put"|"patch"|"delete";

export interface PluginRegisteredHttpEndpoint {
    method: HttpMethod;
    route: string;
    body: (req: polka.Request, res: Response) => any;
}

function RegisterHttpEndpoint(method: HttpMethod, route: string) {
    return function (target: any, propertyKey: string, descriptor: TypedPropertyDescriptor<(req: polka.Request, res: Response) => any>) {
        const cachedEndpoints: PluginRegisteredHttpEndpoint[] = Reflect.getMetadata(hindenburgHttpEndpointsKey, target);
        const endpoints = cachedEndpoints || [];
        if (!cachedEndpoints)
            Reflect.defineMetadata(hindenburgHttpEndpointsKey, endpoints, target);

        endpoints.push({
            method,
            route,
            body: descriptor.value!
        });
    }
}

export function getPluginHttpEndpoints(target: typeof Plugin|Plugin): PluginRegisteredHttpEndpoint[] {
    return Reflect.getMetadata(hindenburgHttpEndpointsKey, target) || [];
}

export namespace HttpEndpoint {
    export function Get(route: string) {
        return RegisterHttpEndpoint("get", route);
    }

    export function Post(route: string) {
        return RegisterHttpEndpoint("post", route);
    }

    export function Put(route: string) {
        return RegisterHttpEndpoint("put", route);
    }

    export function Patch(route: string) {
        return RegisterHttpEndpoint("patch", route);
    }

    export function Delete(route: string) {
        return RegisterHttpEndpoint("delete", route);
    }
}