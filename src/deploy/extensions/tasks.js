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
exports.deleteExtensionInstanceTask = exports.configureExtensionInstanceTask = exports.updateExtensionInstanceTask = exports.createExtensionInstanceTask = exports.extensionsDeploymentHandler = void 0;
const clc = __importStar(require("colorette"));
const error_1 = require("../../error");
const extensionsApi = __importStar(require("../../extensions/extensionsApi"));
const extensionsHelper_1 = require("../../extensions/extensionsHelper");
const refs = __importStar(require("../../extensions/refs"));
const utils = __importStar(require("../../utils"));
const error_2 = require("../../error");
const isRetryable = (err) => err.status === 429 || err.status === 409;
function extensionsDeploymentHandler(errorHandler) {
    return async (task) => {
        let result;
        try {
            result = await task.run();
        }
        catch (err) {
            if (isRetryable(err)) {
                // Rethrow quota errors or operation already in progress so that throttler retries them.
                throw err;
            }
            errorHandler.record(task.spec.instanceId, task.type, err.context?.body?.error?.message ?? err);
        }
        return result;
    };
}
exports.extensionsDeploymentHandler = extensionsDeploymentHandler;
function createExtensionInstanceTask(projectId, instanceSpec, validateOnly = false) {
    const run = async () => {
        if (!validateOnly) {
            utils.logLabeledBullet("extensions", `Creating ${clc.bold(instanceSpec.instanceId)} extension instance`);
        }
        const createArgs = {
            projectId,
            instanceId: instanceSpec.instanceId,
            params: instanceSpec.params,
            systemParams: instanceSpec.systemParams,
            allowedEventTypes: instanceSpec.allowedEventTypes,
            eventarcChannel: instanceSpec.eventarcChannel,
            validateOnly,
            labels: instanceSpec.labels,
        };
        if (instanceSpec.ref) {
            createArgs.extensionVersionRef = refs.toExtensionVersionRef(instanceSpec.ref);
        }
        else if (instanceSpec.localPath) {
            createArgs.extensionSource = await (0, extensionsHelper_1.createSourceFromLocation)(projectId, instanceSpec.localPath);
        }
        else {
            throw new error_1.FirebaseError(`Tried to create extension instance ${instanceSpec.instanceId} without a ref or a local path. This should never happen.`);
        }
        try {
            await extensionsApi.createInstance(createArgs);
        }
        catch (err) {
            if ((0, error_2.isObject)(err) && err.status === 409) {
                // Throwing this error here means not retrying
                throw new error_1.FirebaseError(`Failed to create extension instance. Extension instance ${clc.bold(instanceSpec.instanceId)} already exists.`);
            }
            throw err;
        }
        printSuccess(instanceSpec.instanceId, "create", validateOnly);
        return;
    };
    return {
        run,
        spec: instanceSpec,
        type: "create",
    };
}
exports.createExtensionInstanceTask = createExtensionInstanceTask;
function updateExtensionInstanceTask(projectId, instanceSpec, validateOnly = false) {
    const run = async () => {
        if (!validateOnly) {
            utils.logLabeledBullet("extensions", `Updating ${clc.bold(instanceSpec.instanceId)} extension instance`);
        }
        if (instanceSpec.ref) {
            await extensionsApi.updateInstanceFromRegistry({
                projectId,
                instanceId: instanceSpec.instanceId,
                extRef: refs.toExtensionVersionRef(instanceSpec.ref),
                params: instanceSpec.params,
                systemParams: instanceSpec.systemParams,
                canEmitEvents: !!instanceSpec.allowedEventTypes,
                allowedEventTypes: instanceSpec.allowedEventTypes,
                eventarcChannel: instanceSpec.eventarcChannel,
                validateOnly,
            });
        }
        else if (instanceSpec.localPath) {
            const extensionSource = await (0, extensionsHelper_1.createSourceFromLocation)(projectId, instanceSpec.localPath);
            await extensionsApi.updateInstance({
                projectId,
                instanceId: instanceSpec.instanceId,
                extensionSource,
                validateOnly,
                params: instanceSpec.params,
                systemParams: instanceSpec.systemParams,
                canEmitEvents: !!instanceSpec.allowedEventTypes,
                allowedEventTypes: instanceSpec.allowedEventTypes,
                eventarcChannel: instanceSpec.eventarcChannel,
            });
        }
        else {
            throw new error_1.FirebaseError(`Tried to update extension instance ${instanceSpec.instanceId} without a ref or a local path. This should never happen.`);
        }
        printSuccess(instanceSpec.instanceId, "update", validateOnly);
        return;
    };
    return {
        run,
        spec: instanceSpec,
        type: "update",
    };
}
exports.updateExtensionInstanceTask = updateExtensionInstanceTask;
function configureExtensionInstanceTask(projectId, instanceSpec, validateOnly = false) {
    const run = async () => {
        if (!validateOnly) {
            utils.logLabeledBullet("extensions", `Configuring ${clc.bold(instanceSpec.instanceId)} extension instance`);
        }
        if (instanceSpec.ref) {
            await extensionsApi.configureInstance({
                projectId,
                instanceId: instanceSpec.instanceId,
                params: instanceSpec.params,
                systemParams: instanceSpec.systemParams,
                canEmitEvents: !!instanceSpec.allowedEventTypes,
                allowedEventTypes: instanceSpec.allowedEventTypes,
                eventarcChannel: instanceSpec.eventarcChannel,
                validateOnly,
            });
        }
        else if (instanceSpec.localPath) {
            // We should _always_ be updating when using local extensions, since we don't know if there was a code change at the local path since last deploy.
            throw new error_1.FirebaseError(`Tried to configure extension instance ${instanceSpec.instanceId} from a local path. This should never happen.`);
        }
        else {
            throw new error_1.FirebaseError(`Tried to configure extension instance ${instanceSpec.instanceId} without a ref or a local path. This should never happen.`);
        }
        printSuccess(instanceSpec.instanceId, "configure", validateOnly);
        return;
    };
    return {
        run,
        spec: instanceSpec,
        type: "configure",
    };
}
exports.configureExtensionInstanceTask = configureExtensionInstanceTask;
function deleteExtensionInstanceTask(projectId, instanceSpec) {
    const run = async () => {
        utils.logLabeledBullet("extensions", `Deleting ${clc.bold(instanceSpec.instanceId)} extension instance`);
        await extensionsApi.deleteInstance(projectId, instanceSpec.instanceId);
        printSuccess(instanceSpec.instanceId, "delete", false);
        return;
    };
    return {
        run,
        spec: instanceSpec,
        type: "delete",
    };
}
exports.deleteExtensionInstanceTask = deleteExtensionInstanceTask;
function printSuccess(instanceId, type, validateOnly) {
    const action = validateOnly ? `validated ${type} for` : `${type}d`;
    utils.logSuccess(clc.bold(clc.green("extensions")) + ` Successfully ${action} ${instanceId}`);
}
//# sourceMappingURL=tasks.js.map