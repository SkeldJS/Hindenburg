import vorpal from "vorpal";

import { Plugin } from "../../handlers";
import { MethodDecorator } from "../types";

const waterwayCliCommandsKey = Symbol("waterway:clicommands");

export interface CliCommandOptionInformation {
    usage: string;
    description?: string;
}

export interface CliCommandInformation extends CliCommandOptionInformation {
    options?: CliCommandOptionInformation[];
}

export interface PluginRegisteredCliCommandInfo {
    handler: (args: vorpal.Args|string) => Promise<any>;
    command: CliCommandInformation;
}

export function CliCommand(command: CliCommandInformation): MethodDecorator<(args: vorpal.Args|string) => Promise<any>> {
    return function(
        target: any,
        propertyKey: string,
        descriptor: TypedPropertyDescriptor<(args: vorpal.Args|string) => Promise<any>> // basically has to be a promise else vorpal won't complete without a callback
    ) {
        if (!descriptor.value)
            return;

        const cachedSet: PluginRegisteredCliCommandInfo[]|undefined = Reflect.getMetadata(waterwayCliCommandsKey, target);
        const cliCommandsToRegister = cachedSet || [];
        if (!cachedSet) {
            Reflect.defineMetadata(waterwayCliCommandsKey, cliCommandsToRegister, target);
        }

        cliCommandsToRegister.push({
            handler: descriptor.value,
            command
        });
    };
}

export function getPluginCliCommands(pluginCtr: typeof Plugin|Plugin): PluginRegisteredCliCommandInfo[] {
    return Reflect.getMetadata(waterwayCliCommandsKey, pluginCtr) || [];
}
