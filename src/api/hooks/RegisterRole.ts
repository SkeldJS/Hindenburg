import { BaseRole } from "@skeldjs/core";
import { SomePluginCtr } from "../../handlers";
import { ClassDecorator } from "../types";

const hindenburgRegisterRole = Symbol("hindenburg:registerrole");

export function RegisterRole(role: typeof BaseRole): ClassDecorator {
    return function (target: any) {
        const cachedSet: typeof BaseRole[]|undefined = Reflect.getMetadata(hindenburgRegisterRole, target);
        const rolesToRegister = cachedSet || [];
        if (!cachedSet) {
            Reflect.defineMetadata(hindenburgRegisterRole, rolesToRegister, target);
        }

        rolesToRegister.push(role);
    };
}

export function getPluginRegisteredRoles(pluginCtr: SomePluginCtr): typeof BaseRole[] {
    return Reflect.getMetadata(hindenburgRegisterRole, pluginCtr) || [];
}
