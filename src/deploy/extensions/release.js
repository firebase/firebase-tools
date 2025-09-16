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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.release = void 0;
const queue_1 = __importDefault(require("../../throttler/queue"));
const tasks = __importStar(require("./tasks"));
const planner = __importStar(require("./planner"));
const error_1 = require("../../error");
const errors_1 = require("./errors");
const projectUtils_1 = require("../../projectUtils");
const etags_1 = require("../../extensions/etags");
const track_1 = require("../../track");
async function release(context, options, payload) {
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
    for (const inst of payload.instancesToConfigure ?? []) {
        const task = tasks.configureExtensionInstanceTask(projectId, inst);
        void deploymentQueue.run(task);
    }
    for (const inst of payload.instancesToDelete ?? []) {
        const task = tasks.deleteExtensionInstanceTask(projectId, inst);
        void deploymentQueue.run(task);
    }
    for (const inst of payload.instancesToCreate ?? []) {
        const task = tasks.createExtensionInstanceTask(projectId, inst);
        void deploymentQueue.run(task);
    }
    for (const inst of payload.instancesToUpdate ?? []) {
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
        extension_instance_created: payload.instancesToCreate?.length ?? 0,
        extension_instance_updated: payload.instancesToUpdate?.length ?? 0,
        extension_instance_configured: payload.instancesToConfigure?.length ?? 0,
        extension_instance_deleted: payload.instancesToDelete?.length ?? 0,
        errors: errorHandler.errors.length ?? 0,
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
//# sourceMappingURL=release.js.map