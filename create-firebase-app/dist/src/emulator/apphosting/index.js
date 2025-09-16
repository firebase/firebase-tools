"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppHostingEmulator = void 0;
const types_1 = require("../types");
const serve_1 = require("./serve");
const developmentServer_1 = require("./developmentServer");
/**
 * An emulator instance for Firebase's App Hosting product. This class provides a simulated
 * environment for testing App Hosting features locally.
 */
class AppHostingEmulator {
    constructor(args) {
        this.args = args;
    }
    async start() {
        const { hostname, port } = await (0, serve_1.start)({
            projectId: this.args.projectId,
            backendId: this.args.backendId,
            port: this.args.port,
            startCommand: this.args.startCommand,
            rootDirectory: this.args.rootDirectory,
        });
        this.args.options.host = hostname;
        this.args.options.port = port;
    }
    connect() {
        developmentServer_1.logger.logLabeled("INFO", types_1.Emulators.APPHOSTING, "connecting apphosting emulator");
        return Promise.resolve();
    }
    stop() {
        developmentServer_1.logger.logLabeled("INFO", types_1.Emulators.APPHOSTING, "stopping apphosting emulator");
        return Promise.resolve();
    }
    getInfo() {
        return {
            name: types_1.Emulators.APPHOSTING,
            host: this.args.options.host,
            port: this.args.options.port,
        };
    }
    getName() {
        return types_1.Emulators.APPHOSTING;
    }
}
exports.AppHostingEmulator = AppHostingEmulator;
