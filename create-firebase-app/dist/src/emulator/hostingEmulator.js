"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HostingEmulator = void 0;
const serveHosting = require("../serve/hosting");
const types_1 = require("../emulator/types");
const constants_1 = require("./constants");
class HostingEmulator {
    constructor(args) {
        this.args = args;
    }
    async start() {
        this.args.options.host = this.args.host;
        this.args.options.port = this.args.port;
        const { ports } = await serveHosting.start(this.args.options);
        this.args.port = ports[0];
        if (ports.length > 1) {
            this.reservedPorts = ports.slice(1);
        }
    }
    connect() {
        return Promise.resolve();
    }
    stop() {
        return serveHosting.stop();
    }
    getInfo() {
        const host = this.args.host || constants_1.Constants.getDefaultHost();
        const port = this.args.port || constants_1.Constants.getDefaultPort(types_1.Emulators.HOSTING);
        return {
            name: this.getName(),
            host,
            port,
            reservedPorts: this.reservedPorts,
        };
    }
    getName() {
        return types_1.Emulators.HOSTING;
    }
}
exports.HostingEmulator = HostingEmulator;
