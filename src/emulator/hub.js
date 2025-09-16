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
exports.EmulatorHub = void 0;
const os = __importStar(require("os"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const utils = __importStar(require("../utils"));
const logger_1 = require("../logger");
const types_1 = require("./types");
const hubExport_1 = require("./hubExport");
const registry_1 = require("./registry");
const ExpressBasedEmulator_1 = require("./ExpressBasedEmulator");
// We use the CLI version from package.json
const pkg = require("../../package.json");
class EmulatorHub extends ExpressBasedEmulator_1.ExpressBasedEmulator {
    /**
     * Given a project ID, find and read the Locator file for the emulator hub.
     * This is useful so that multiple copies of the Firebase CLI can discover
     * each other.
     */
    static readLocatorFile(projectId) {
        const locatorPath = this.getLocatorFilePath(projectId);
        if (!fs.existsSync(locatorPath)) {
            return undefined;
        }
        const data = fs.readFileSync(locatorPath, "utf8").toString();
        const locator = JSON.parse(data);
        if (locator.version !== this.CLI_VERSION) {
            logger_1.logger.debug(`Found emulator locator with different version: ${JSON.stringify(locator)}, CLI_VERSION: ${this.CLI_VERSION}`);
        }
        return locator;
    }
    static getLocatorFilePath(projectId) {
        const dir = os.tmpdir();
        if (!projectId) {
            projectId = EmulatorHub.MISSING_PROJECT_PLACEHOLDER;
        }
        const filename = `hub-${projectId}.json`;
        const locatorPath = path.join(dir, filename);
        logger_1.logger.debug(`Emulator locator file path: ${locatorPath}`);
        return locatorPath;
    }
    constructor(args) {
        super({
            listen: args.listen,
        });
        this.args = args;
    }
    async start() {
        await super.start();
        await this.writeLocatorFile();
    }
    getRunningEmulatorsMapping() {
        const emulators = {};
        for (const info of registry_1.EmulatorRegistry.listRunningWithInfo()) {
            emulators[info.name] = {
                listen: this.args.listenForEmulator[info.name],
                ...info,
            };
        }
        return emulators;
    }
    async createExpressApp() {
        const app = await super.createExpressApp();
        app.get("/", (req, res) => {
            res.json({
                ...this.getLocator(),
                // For backward compatibility:
                host: utils.connectableHostname(this.args.listen[0].address),
                port: this.args.listen[0].port,
            });
        });
        app.get(EmulatorHub.PATH_EMULATORS, (req, res) => {
            res.json(this.getRunningEmulatorsMapping());
        });
        app.post(EmulatorHub.PATH_EXPORT, async (req, res) => {
            if (req.headers.origin) {
                res.status(403).json({
                    message: `Export cannot be triggered by external callers.`,
                });
            }
            const path = req.body.path;
            const initiatedBy = req.body.initiatedBy || "unknown";
            utils.logLabeledBullet("emulators", `Received export request. Exporting data to ${path}.`);
            try {
                await new hubExport_1.HubExport(this.args.projectId, {
                    path,
                    initiatedBy,
                }).exportAll();
                utils.logLabeledSuccess("emulators", "Export complete.");
                res.status(200).send({
                    message: "OK",
                });
            }
            catch (e) {
                const errorString = e.message || JSON.stringify(e);
                utils.logLabeledWarning("emulators", `Export failed: ${errorString}`);
                res.status(500).json({
                    message: errorString,
                });
            }
        });
        app.put(EmulatorHub.PATH_DISABLE_FUNCTIONS, async (req, res) => {
            utils.logLabeledBullet("emulators", `Disabling Cloud Functions triggers, non-HTTP functions will not execute.`);
            const instance = registry_1.EmulatorRegistry.get(types_1.Emulators.FUNCTIONS);
            if (!instance) {
                res.status(400).json({ error: "The Cloud Functions emulator is not running." });
                return;
            }
            const emu = instance;
            await emu.disableBackgroundTriggers();
            res.status(200).json({ enabled: false });
        });
        app.put(EmulatorHub.PATH_ENABLE_FUNCTIONS, async (req, res) => {
            utils.logLabeledBullet("emulators", `Enabling Cloud Functions triggers, non-HTTP functions will execute.`);
            const instance = registry_1.EmulatorRegistry.get(types_1.Emulators.FUNCTIONS);
            if (!instance) {
                res.status(400).send("The Cloud Functions emulator is not running.");
                return;
            }
            const emu = instance;
            await emu.reloadTriggers();
            res.status(200).json({ enabled: true });
        });
        app.post(EmulatorHub.PATH_CLEAR_DATA_CONNECT, async (req, res) => {
            if (req.headers.origin) {
                res.status(403).json({
                    message: `Clear Data Connect cannot be triggered by external callers.`,
                });
            }
            utils.logLabeledBullet("emulators", `Clearing data from Data Connect data sources.`);
            const instance = registry_1.EmulatorRegistry.get(types_1.Emulators.DATACONNECT);
            if (!instance) {
                res.status(400).json({ error: "The Data Connect emulator is not running." });
                return;
            }
            await instance.clearData();
            res.status(200).json({ success: true });
        });
        return app;
    }
    async stop() {
        await super.stop();
        await this.deleteLocatorFile();
    }
    getName() {
        return types_1.Emulators.HUB;
    }
    getLocator() {
        const version = pkg.version;
        const origins = [];
        for (const spec of this.args.listen) {
            if (spec.family === "IPv6") {
                origins.push(`http://[${utils.connectableHostname(spec.address)}]:${spec.port}`);
            }
            else {
                origins.push(`http://${utils.connectableHostname(spec.address)}:${spec.port}`);
            }
        }
        return {
            version,
            origins,
        };
    }
    async writeLocatorFile() {
        const projectId = this.args.projectId;
        const locatorPath = EmulatorHub.getLocatorFilePath(projectId);
        const locator = this.getLocator();
        if (fs.existsSync(locatorPath)) {
            utils.logLabeledWarning("emulators", `It seems that you are running multiple instances of the emulator suite for project ${projectId}. This may result in unexpected behavior.`);
        }
        logger_1.logger.debug(`[hub] writing locator at ${locatorPath}`);
        return new Promise((resolve, reject) => {
            fs.writeFile(locatorPath, JSON.stringify(locator), (e) => {
                if (e) {
                    reject(e);
                }
                else {
                    resolve();
                }
            });
        });
    }
    async deleteLocatorFile() {
        const locatorPath = EmulatorHub.getLocatorFilePath(this.args.projectId);
        return new Promise((resolve, reject) => {
            fs.unlink(locatorPath, (e) => {
                // If the file is already deleted, no need to throw.
                if (e && e.code !== "ENOENT") {
                    reject(e);
                }
                else {
                    resolve();
                }
            });
        });
    }
}
exports.EmulatorHub = EmulatorHub;
EmulatorHub.MISSING_PROJECT_PLACEHOLDER = "demo-no-project";
EmulatorHub.CLI_VERSION = pkg.version;
EmulatorHub.PATH_EXPORT = "/_admin/export";
EmulatorHub.PATH_DISABLE_FUNCTIONS = "/functions/disableBackgroundTriggers";
EmulatorHub.PATH_ENABLE_FUNCTIONS = "/functions/enableBackgroundTriggers";
EmulatorHub.PATH_EMULATORS = "/emulators";
EmulatorHub.PATH_CLEAR_DATA_CONNECT = "/dataconnect/clearData";
//# sourceMappingURL=hub.js.map