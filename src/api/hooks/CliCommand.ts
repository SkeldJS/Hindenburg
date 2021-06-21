import vorpal from "vorpal";
export const hindenburgVorpalCommand = Symbol("hindenburg:vorpalcommand");

export interface VorpalCommandOptionInformation {
    usage: string;
    description?: string;
}

export interface VorpalCommandInformation extends VorpalCommandOptionInformation {
    options?: VorpalCommandOptionInformation[];
}

export function CliCommand(command: VorpalCommandInformation) {
    return function(
        target: any,
        propertyKey: string,
        descriptor: TypedPropertyDescriptor<(args: vorpal.Args) => Promise<void>> // basically has to be a promise else vorpal won't complete without a callback, which is dumb in 2021.
    ) {
        if (!descriptor.value)
            return;

        Reflect.defineMetadata(hindenburgVorpalCommand, command, target, propertyKey);
    }
}