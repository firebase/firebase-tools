"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmulatorUI = void 0;
const express = require("express");
const path = require("path");
const types_1 = require("./types");
const downloadableEmulators = require("./downloadableEmulators");
const registry_1 = require("./registry");
const error_1 = require("../error");
const emulatorLogger_1 = require("./emulatorLogger");
const constants_1 = require("./constants");
const track_1 = require("../track");
const ExpressBasedEmulator_1 = require("./ExpressBasedEmulator");
const experiments_1 = require("../experiments");
const functional_1 = require("../functional");
const env_1 = require("./env");
class EmulatorUI extends ExpressBasedEmulator_1.ExpressBasedEmulator {
    constructor(args) {
        super({
            listen: args.listen,
        });
        this.args = args;
    }
    async start() {
        await super.start();
    }
    async createExpressApp() {
        if (!registry_1.EmulatorRegistry.isRunning(types_1.Emulators.HUB)) {
            throw new error_1.FirebaseError(`Cannot start ${constants_1.Constants.description(types_1.Emulators.UI)} without ${constants_1.Constants.description(types_1.Emulators.HUB)}!`);
        }
        const hub = registry_1.EmulatorRegistry.get(types_1.Emulators.HUB);
        const app = await super.createExpressApp();
        const { projectId } = this.args;
        const enabledExperiments = Object.keys(experiments_1.ALL_EXPERIMENTS).filter((experimentName) => (0, experiments_1.isEnabled)(experimentName));
        const emulatorGaSession = (0, track_1.emulatorSession)();
        await downloadableEmulators.downloadIfNecessary(types_1.Emulators.UI);
        const downloadDetails = downloadableEmulators.getDownloadDetails(types_1.Emulators.UI);
        const webDir = path.join(downloadDetails.unzipDir, "client");
        // Exposes the host and port of various emulators to facilitate accessing
        // them using client SDKs. For features that involve multiple emulators or
        // hard to accomplish using client SDKs, consider adding an API below
        app.get("/api/config", this.jsonHandler(() => {
            const emulatorInfos = (0, functional_1.mapObject)(hub.getRunningEmulatorsMapping(), env_1.maybeUsePortForwarding);
            const json = Object.assign({ projectId, experiments: enabledExperiments !== null && enabledExperiments !== void 0 ? enabledExperiments : [], analytics: emulatorGaSession }, emulatorInfos);
            return Promise.resolve(json);
        }));
        app.use(express.static(webDir));
        // Required for the router to work properly.
        app.get("*", (_, res) => {
            res.sendFile(path.join(webDir, "index.html"));
        });
        return app;
    }
    connect() {
        return Promise.resolve();
    }
    getName() {
        return types_1.Emulators.UI;
    }
    jsonHandler(handler) {
        return (req, res) => {
            handler(req).then((body) => {
                res.status(200).json(body);
            }, (err) => {
                emulatorLogger_1.EmulatorLogger.forEmulator(types_1.Emulators.UI).log("ERROR", err);
                res.status(500).json({
                    message: err.message,
                    stack: err.stack,
                    raw: err,
                });
            });
        };
    }
}
exports.EmulatorUI = EmulatorUI;
