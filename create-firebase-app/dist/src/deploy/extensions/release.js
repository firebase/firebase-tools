"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.release = void 0;
const queue_1 = require("../../throttler/queue");
const tasks = require("./tasks");
const planner = require("./planner");
const error_1 = require("../../error");
const errors_1 = require("./errors");
const projectUtils_1 = require("../../projectUtils");
const etags_1 = require("../../extensions/etags");
const track_1 = require("../../track");
async function release(context, options, payload) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o;
    if (!payload.instancesToCreate &&
        !payload.instancesToUpdate &&
        !payload.instancesToConfigure &&
        !payload.instancesToDelete) {
        return;
    }
    const projectId = (0, projectUtils_1.needProjectId)(options);
    const errorHandler = new errors_1.ErrorHandler();
    const deploymentQueue = new queue_1.default({
        retries: 5,
        concurrency: 5,
        handler: tasks.extensionsDeploymentHandler(errorHandler),
    });
    for (const inst of (_a = payload.instancesToConfigure) !== null && _a !== void 0 ? _a : []) {
        const task = tasks.configureExtensionInstanceTask(projectId, inst);
        void deploymentQueue.run(task);
    }
    for (const inst of (_b = payload.instancesToDelete) !== null && _b !== void 0 ? _b : []) {
        const task = tasks.deleteExtensionInstanceTask(projectId, inst);
        void deploymentQueue.run(task);
    }
    for (const inst of (_c = payload.instancesToCreate) !== null && _c !== void 0 ? _c : []) {
        const task = tasks.createExtensionInstanceTask(projectId, inst);
        void deploymentQueue.run(task);
    }
    for (const inst of (_d = payload.instancesToUpdate) !== null && _d !== void 0 ? _d : []) {
        const task = tasks.updateExtensionInstanceTask(projectId, inst);
        void deploymentQueue.run(task);
    }
    // Note: We need to wait() _BEFORE_ calling process() and close().
    const deploymentPromise = deploymentQueue.wait();
    deploymentQueue.process();
    deploymentQueue.close();
    await deploymentPromise;
    // extensionsStartTime should always be populated, but if not, fall back to something that won't break us.
    const duration = context.extensionsStartTime ? Date.now() - context.extensionsStartTime : 1;
    await (0, track_1.trackGA4)("extensions_deploy", {
        extension_instance_created: (_f = (_e = payload.instancesToCreate) === null || _e === void 0 ? void 0 : _e.length) !== null && _f !== void 0 ? _f : 0,
        extension_instance_updated: (_h = (_g = payload.instancesToUpdate) === null || _g === void 0 ? void 0 : _g.length) !== null && _h !== void 0 ? _h : 0,
        extension_instance_configured: (_k = (_j = payload.instancesToConfigure) === null || _j === void 0 ? void 0 : _j.length) !== null && _k !== void 0 ? _k : 0,
        extension_instance_deleted: (_m = (_l = payload.instancesToDelete) === null || _l === void 0 ? void 0 : _l.length) !== null && _m !== void 0 ? _m : 0,
        errors: (_o = errorHandler.errors.length) !== null && _o !== void 0 ? _o : 0,
        interactive: options.nonInteractive ? "false" : "true",
    }, duration);
    // After deployment, write the latest etags to RC so we can detect out of
    // band changes in the next deploy.
    const have = await planner.have(projectId);
    const dynamicHave = await planner.haveDynamic(projectId);
    (0, etags_1.saveEtags)(options.rc, projectId, have.concat(dynamicHave));
    if (errorHandler.hasErrors()) {
        errorHandler.print();
        throw new error_1.FirebaseError(`Extensions deployment failed.`);
    }
}
exports.release = release;
