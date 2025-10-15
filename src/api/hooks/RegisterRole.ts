import { BaseRole } from "@skeldjs/core";
import { SomePluginCtr } from "../../handlers";
import { ClassDecorator } from "../types";

const waterwayRegisterRole = Symbol("waterway:registerrole");

export function RegisterRole(role: typeof BaseRole): ClassDecorator {
    return function (target: any) {
        const cachedSet: typeof BaseRole[]|undefined = Reflect.getMetadata(waterwayRegisterRole, target);
        const rolesToRegister = cachedSet || [];
        if (!cachedSet) {
            Reflect.defineMetadata(waterwayRegisterRole, rolesToRegister, target);
        }

        rolesToRegister.push(role);
    };
}

export function getPluginRegisteredRoles(pluginCtr: SomePluginCtr): typeof BaseRole[] {
    return Reflect.getMetadata(waterwayRegisterRole, pluginCtr) || [];
}
