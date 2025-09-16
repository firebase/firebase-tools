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
exports.EmulatorRegistry = void 0;
const types_1 = require("./types");
const error_1 = require("../error");
const portUtils = __importStar(require("./portUtils"));
const constants_1 = require("./constants");
const emulatorLogger_1 = require("./emulatorLogger");
const utils_1 = require("../utils");
const apiv2_1 = require("../apiv2");
const downloadableEmulators_1 = require("./downloadableEmulators");
/**
 * Static registry for running emulators to discover each other.
 *
 * Note that this is global mutable state, but the state can only be modified
 * through the start() and stop() methods which ensures correctness.
 */
class EmulatorRegistry {
    static async start(instance) {
        const description = constants_1.Constants.description(instance.getName());
        if (this.isRunning(instance.getName())) {
            throw new error_1.FirebaseError(`${description} is already running!`, {});
        }
        // must be before we start as else on a quick 'Ctrl-C' after starting we could skip this emulator in cleanShutdown
        this.set(instance.getName(), instance);
        // Start the emulator and wait for it to grab its assigned port.
        await instance.start();
        // No need to wait for the Extensions emulator to block its port, since it runs on the Functions emulator.
        if (instance.getName() !== types_1.Emulators.EXTENSIONS) {
            const info = instance.getInfo();
            await portUtils.waitForPortUsed(info.port, (0, utils_1.connectableHostname)(info.host), info.timeout);
        }
    }
    static async stop(name) {
        emulatorLogger_1.EmulatorLogger.forEmulator(name).logLabeled("BULLET", name, `Stopping ${constants_1.Constants.description(name)}`);
        const instance = this.get(name);
        if (!instance) {
            return;
        }
        try {
            await instance.stop();
            this.clear(instance.getName());
        }
        catch (e) {
            emulatorLogger_1.EmulatorLogger.forEmulator(name).logLabeled("WARN", name, `Error stopping ${constants_1.Constants.description(name)}`);
        }
    }
    static async stopAll() {
        const stopPriority = {
            // Turn off the UI first, user should not interact
            // once shutdown starts
            ui: 0,
            // The Extensions emulator runs on the same process as the Functions emulator
            // so this is a no-op. We put this before functions for future proofing, since
            // the Extensions emulator depends on the Functions emulator.
            extensions: 1,
            // Functions is next since it has side effects and
            // dependencies across all the others
            functions: 1.1,
            // Hosting is next because it can trigger functions.
            hosting: 2,
            /** App Hosting should be shut down next. Users should not be interacting
             * with their app while its being shut down as the app may using the
             * background trigger emulators below.
             */
            apphosting: 2.1,
            // All background trigger emulators are equal here, so we choose
            // an order for consistency.
            database: 3.0,
            firestore: 3.1,
            pubsub: 3.2,
            auth: 3.3,
            storage: 3.5,
            eventarc: 3.6,
            dataconnect: 3.7,
            tasks: 3.8,
            // Hub shuts down once almost everything else is done
            hub: 4,
            // Logging is last to catch all errors
            logging: 5,
        };
        const emulatorsToStop = this.listRunning().sort((a, b) => {
            return stopPriority[a] - stopPriority[b];
        });
        for (const name of emulatorsToStop) {
            await this.stop(name);
        }
    }
    static isRunning(emulator) {
        if (emulator === types_1.Emulators.EXTENSIONS) {
            // Check if the functions emulator is also running - if not, the Extensions emulator won't work.
            return this.INSTANCES.get(emulator) !== undefined && this.isRunning(types_1.Emulators.FUNCTIONS);
        }
        const instance = this.INSTANCES.get(emulator);
        return instance !== undefined;
    }
    static listRunning() {
        return types_1.ALL_EMULATORS.filter((name) => this.isRunning(name));
    }
    static listRunningWithInfo() {
        return this.listRunning()
            .map((emulator) => this.getInfo(emulator))
            .filter((info) => typeof info !== "undefined");
    }
    static get(emulator) {
        return this.INSTANCES.get(emulator);
    }
    /**
     * Get information about an emulator. Use `url` instead for creating URLs.
     */
    static getInfo(emulator) {
        const info = EmulatorRegistry.get(emulator)?.getInfo();
        if (!info) {
            return undefined;
        }
        return {
            ...info,
            host: (0, utils_1.connectableHostname)(info.host),
        };
    }
    static getDetails(emulator) {
        return (0, downloadableEmulators_1.get)(emulator);
    }
    /**
     * Return a URL object with the emulator protocol, host, and port populated.
     *
     * Need to make an API request? Use `.client` instead.
     *
     * @param emulator for retrieving host and port from the registry
     * @param req if provided, will prefer reflecting back protocol+host+port from
     *            the express request (if header available) instead of registry
     * @return a WHATWG URL object with .host set to the emulator host + port
     */
    static url(emulator, req) {
        // WHATWG URL API has no way to create from parts, so let's use a minimal
        // working URL to start. (Let's avoid legacy Node.js `url.format`.)
        const url = new URL("http://unknown/");
        if (req) {
            url.protocol = req.protocol;
            // Try the Host request header, since it contains hostname + port already
            // and has been proved to work (since we've got the client request).
            const host = req.headers.host;
            if (host) {
                url.host = host;
                return url;
            }
        }
        // Fall back to the host and port from registry. This provides a reasonable
        // value in most cases but may not work if the client needs to connect via
        // another host, e.g. in Dockers or behind reverse proxies.
        const info = EmulatorRegistry.getInfo(emulator);
        if (info) {
            if (info.host.includes(":")) {
                url.hostname = `[${info.host}]`; // IPv6 addresses need to be quoted.
            }
            else {
                url.hostname = info.host;
            }
            url.port = info.port.toString();
        }
        else {
            throw new Error(`Cannot determine host and port of ${emulator}`);
        }
        return url;
    }
    static client(emulator, options = {}) {
        return new apiv2_1.Client({
            urlPrefix: EmulatorRegistry.url(emulator).toString(),
            auth: false,
            ...options,
        });
    }
    static set(emulator, instance) {
        this.INSTANCES.set(emulator, instance);
    }
    static clear(emulator) {
        this.INSTANCES.delete(emulator);
    }
}
exports.EmulatorRegistry = EmulatorRegistry;
EmulatorRegistry.INSTANCES = new Map();
//# sourceMappingURL=registry.js.map