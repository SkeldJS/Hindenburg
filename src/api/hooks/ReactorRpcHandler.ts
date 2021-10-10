import { Networkable } from "@skeldjs/core";
import { MessageDirection, PacketDecoder } from "@skeldjs/protocol";
import { HazelReader } from "@skeldjs/util";

import { Plugin } from "../../handlers";
import { BaseReactorRpcMessage } from "../BaseReactorRpcMessage";

const hindenburgReactorRpcKey = Symbol("hindenburg:reactorrpc");

export type ReactorRpcConstructor<T extends BaseReactorRpcMessage> = {
    new (...args: any): T;
    Deserialize(reader: HazelReader, direction: MessageDirection, decoder: PacketDecoder): T;
    messageType: "reactorRpc";
    modId: string;
    messageTag: number;
}

export interface PluginRegisteredRpcHandlerInfo {
    handler: (component: Networkable, rpc: BaseReactorRpcMessage) => any;
    reactorRpc: ReactorRpcConstructor<BaseReactorRpcMessage>;
}

export function ReactorRpcHandler<
    ComponentType extends Networkable,
    RpcType extends BaseReactorRpcMessage
>(reactorRpc: ReactorRpcConstructor<RpcType>) {
    return function(
        target: any,
        propertyKey: string,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        descriptor: TypedPropertyDescriptor<
            (component: ComponentType, rpc: RpcType) => any
        >
    ) {
        if (!descriptor.value)
            return;

        const cachedSet: PluginRegisteredRpcHandlerInfo[]|undefined = Reflect.getMetadata(hindenburgReactorRpcKey, target);
        const reactorRpcHandlersToRegister = cachedSet || [];
        if (!cachedSet) {
            Reflect.defineMetadata(hindenburgReactorRpcKey, reactorRpcHandlersToRegister, target);
        }

        reactorRpcHandlersToRegister.push({
            handler: descriptor.value as (component: Networkable, rpc: BaseReactorRpcMessage) => any,
            reactorRpc
        });
    };
}

export function getPluginReactorRpcHandlers(pluginCtr: typeof Plugin|Plugin): PluginRegisteredRpcHandlerInfo[] {
    return Reflect.getMetadata(hindenburgReactorRpcKey, pluginCtr) || [];
}
