const path = require("path");
const BuiltinModule = require("module");

const Module = module.constructor.length > 1
    ? module.constructor
    : BuiltinModule;

const oldResolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, parentModule, isMain, options) {
    if (request === "@skeldjs/hindenburg") {
        return oldResolveFilename.call(this, path.resolve(__dirname, "../src/index"), parentModule, isMain, options);
    }
    return oldResolveFilename.call(this, request, parentModule, isMain, options);
};
