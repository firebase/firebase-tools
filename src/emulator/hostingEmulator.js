"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.HostingEmulator = void 0;
const serveHosting = __importStar(require("../serve/hosting"));
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
//# sourceMappingURL=hostingEmulator.js.map