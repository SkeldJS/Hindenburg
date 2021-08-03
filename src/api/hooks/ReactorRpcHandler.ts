import { Hostable, Networkable } from "@skeldjs/core";
import { MessageDirection, PacketDecoder } from "@skeldjs/protocol";
import { HazelReader } from "@skeldjs/util";
import { BaseReactorRpcMessage } from "../BaseReactorRpcMessage";

export const hindenburgReactorRpcKey = Symbol("hindenburg:reactor_rpc");

type NetworkableConstructor<T extends Networkable> = {
    new (room: Hostable<any>, netid: number, ownerid: number, data?: HazelReader | any): T;
    classname: string;
};

type ReactorRpcConstructor<T extends BaseReactorRpcMessage> = {
    new (...args: any): T;
    Deserialize(reader: HazelReader, direction: MessageDirection, decoder: PacketDecoder): T;
    type: "reactor";
    modId: string;
    tag: number;
}

export function ReactorRpcHandler<
    ComponentType extends Networkable,
    RpcType extends BaseReactorRpcMessage
>(componentCtr: NetworkableConstructor<ComponentType>, reactorRpc: ReactorRpcConstructor<RpcType>) {
    return function(
        target: any,
        propertyKey: string,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        descriptor: TypedPropertyDescriptor<
            (component: ComponentType, rpc: RpcType) => any
        >
    ) {
        Reflect.defineMetadata(hindenburgReactorRpcKey, {
            componentCtr,
            reactorRpc
        }, target, propertyKey);
    };
}