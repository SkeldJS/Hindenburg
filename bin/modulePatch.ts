import path from "path";
import BuiltinModule from "module";

const Module: any = module.constructor.length > 1
    ? module.constructor
    : BuiltinModule;

const oldResolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request: string, parentModule: any, isMain: boolean, options: any) {
    if (request === "@skeldjs/hindenburg") {
        return oldResolveFilename.call(this, path.resolve(__dirname, "../src/index"), parentModule, isMain, options);
    }
    return oldResolveFilename.call(this, request, parentModule, isMain, options);
};
