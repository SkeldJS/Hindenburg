import vorpal from "vorpal";

import { Plugin } from "../../handlers";

const hindenburgCliCommandsKey = Symbol("hindenburg:clicommands");

export interface CliCommandOptionInformation {
    usage: string;
    description?: string;
}

export interface CliCommandInformation extends CliCommandOptionInformation {
    options?: CliCommandOptionInformation[];
}

export interface PluginRegisteredCliCommandInfo {
    handler: (args: vorpal.Args) => Promise<any>;
    command: CliCommandInformation;
}

export function CliCommand(command: CliCommandInformation) {
    return function(
        target: any,
        propertyKey: string,
        descriptor: TypedPropertyDescriptor<(args: vorpal.Args) => Promise<any>> // basically has to be a promise else vorpal won't complete without a callback
    ) {
        if (!descriptor.value)
            return;

        const cachedSet: PluginRegisteredCliCommandInfo[]|undefined = Reflect.getMetadata(hindenburgCliCommandsKey, target);
        const cliCommandsToRegister = cachedSet || [];
        if (!cachedSet) {
            Reflect.defineMetadata(hindenburgCliCommandsKey, cliCommandsToRegister, target);
        }

        cliCommandsToRegister.push({
            handler: descriptor.value,
            command
        });
    };
}

export function getPluginCliCommands(pluginCtr: typeof Plugin|Plugin): PluginRegisteredCliCommandInfo[] {
    return Reflect.getMetadata(hindenburgCliCommandsKey, pluginCtr) || [];
}
