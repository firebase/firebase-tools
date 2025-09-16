"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Driver = void 0;
class Driver {
    constructor(spec) {
        this.spec = spec;
    }
    install() {
        throw new Error("install() not implemented");
    }
    build() {
        throw new Error("build() not implemented");
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    export(bundle) {
        throw new Error("export() not implemented");
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    execHook(bundle, hook) {
        throw new Error("execHook() not implemented");
    }
}
exports.Driver = Driver;
