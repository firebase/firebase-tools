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
exports.deploy = void 0;
const tasks = __importStar(require("./tasks"));
const queue_1 = __importDefault(require("../../throttler/queue"));
const error_1 = require("../../error");
const errors_1 = require("./errors");
const projectUtils_1 = require("../../projectUtils");
const provisioningHelper_1 = require("../../extensions/provisioningHelper");
const secrets_1 = require("./secrets");
const validate_1 = require("./validate");
/**
 * Deploys extensions
 * @param context The deploy context
 * @param options The deploy options
 * @param payload The deploy payload
 */
async function deploy(context, options, payload) {
    const projectId = (0, projectUtils_1.needProjectId)(options);
    // First, check that billing is enabled
    await (0, validate_1.checkBilling)(projectId, options.nonInteractive);
    // Then, check that required products are provisioned.
    await (0, provisioningHelper_1.bulkCheckProductsProvisioned)(projectId, [
        ...(payload.instancesToCreate ?? []),
        ...(payload.instancesToUpdate ?? []),
        ...(payload.instancesToConfigure ?? []),
    ]);
    if (context.have) {
        // Then, check if the secrets used exist, and prompt to create them if not.
        await (0, secrets_1.handleSecretParams)(payload, context.have, options.nonInteractive);
    }
    // Then, run validateOnly calls.
    const errorHandler = new errors_1.ErrorHandler();
    const validationQueue = new queue_1.default({
        retries: 5,
        concurrency: 5,
        handler: tasks.extensionsDeploymentHandler(errorHandler),
    });
    // Validate all creates, updates and configures.
    // Skip validating local extensions, since doing so requires us to create a new source.
    // No need to validate deletes.
    for (const create of payload.instancesToCreate?.filter((i) => !!i.ref) ?? []) {
        const task = tasks.createExtensionInstanceTask(projectId, create, /* validateOnly=*/ true);
        void validationQueue.run(task);
    }
    for (const update of payload.instancesToUpdate?.filter((i) => !!i.ref) ?? []) {
        const task = tasks.updateExtensionInstanceTask(projectId, update, /* validateOnly=*/ true);
        void validationQueue.run(task);
    }
    for (const configure of payload.instancesToConfigure?.filter((i) => !!i.ref) ?? []) {
        const task = tasks.configureExtensionInstanceTask(projectId, configure, 
        /* validateOnly=*/ true);
        void validationQueue.run(task);
    }
    // Note: We need to wait() _BEFORE_ calling process() and close().
    const validationPromise = validationQueue.wait();
    validationQueue.process();
    validationQueue.close();
    await validationPromise;
    if (errorHandler.hasErrors()) {
        errorHandler.print();
        throw new error_1.FirebaseError(`Extensions deployment failed validation. No changes have been made to the Extension instances on ${projectId}`);
    }
}
exports.deploy = deploy;
//# sourceMappingURL=deploy.js.map