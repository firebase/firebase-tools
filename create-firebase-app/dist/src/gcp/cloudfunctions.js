"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.functionFromEndpoint = exports.endpointFromFunction = exports.listAllFunctions = exports.deleteFunction = exports.updateFunction = exports.setInvokerUpdate = exports.setInvokerCreate = exports.getIamPolicy = exports.setIamPolicy = exports.createFunction = exports.generateUploadUrl = exports.captureRuntimeValidationError = exports.API_VERSION = void 0;
const clc = require("colorette");
const error_1 = require("../error");
const logger_1 = require("../logger");
const backend = require("../deploy/functions/backend");
const utils = require("../utils");
const proto = require("./proto");
const supported = require("../deploy/functions/runtimes/supported");
const projectConfig = require("../functions/projectConfig");
const apiv2_1 = require("../apiv2");
const api_1 = require("../api");
const constants_1 = require("../functions/constants");
exports.API_VERSION = "v1";
const client = new apiv2_1.Client({ urlPrefix: (0, api_1.functionsOrigin)(), apiVersion: exports.API_VERSION });
/**
 * Returns the captured user-friendly message from a runtime validation error.
 * @param errMessage Message from the runtime validation error.
 */
function captureRuntimeValidationError(errMessage) {
    // Regex to capture the content of the 'message' field.
    // The error messages will take this form:
    //    `Failed to create 1st Gen function projects/p/locations/l/functions/f:
    //     runtime: Runtime validation errors: [error_code: INVALID_RUNTIME\n
    //     message: \"Runtime \\\"nodejs22\\\" is not supported on GCF Gen1\"\n]`
    const regex = /message: "((?:\\.|[^"\\])*)"/;
    const match = errMessage.match(regex);
    if (match && match[1]) {
        // The captured string may still contain escaped quotes (e.g., \\").
        // This replaces them with a standard double quote.
        const capturedMessage = match[1].replace(/\\"/g, '"');
        return capturedMessage;
    }
    return "invalid runtime detected, please see https://cloud.google.com/functions/docs/runtime-support for the latest supported runtimes";
}
exports.captureRuntimeValidationError = captureRuntimeValidationError;
/**
 * Logs an error from a failed function deployment.
 * @param funcName Name of the function that was unsuccessfully deployed.
 * @param type Type of deployment - create, update, or delete.
 * @param err The error returned from the operation.
 */
function functionsOpLogReject(funcName, type, err) {
    var _a, _b, _c, _d;
    // Sniff for runtime validation errors and log a more user-friendly warning.
    if ((err === null || err === void 0 ? void 0 : err.message).includes("Runtime validation errors")) {
        const capturedMessage = captureRuntimeValidationError(err.message);
        utils.logWarning(clc.bold(clc.yellow("functions:")) + " " + capturedMessage + " for function " + funcName);
    }
    if (((_b = (_a = err === null || err === void 0 ? void 0 : err.context) === null || _a === void 0 ? void 0 : _a.response) === null || _b === void 0 ? void 0 : _b.statusCode) === 429) {
        utils.logWarning(`${clc.bold(clc.yellow("functions:"))} got "Quota Exceeded" error while trying to ${type} ${funcName}. Waiting to retry...`);
    }
    else {
        utils.logWarning(clc.bold(clc.yellow("functions:")) + " failed to " + type + " function " + funcName);
    }
    throw new error_1.FirebaseError(`Failed to ${type} function ${funcName}`, {
        original: err,
        status: (_d = (_c = err === null || err === void 0 ? void 0 : err.context) === null || _c === void 0 ? void 0 : _c.response) === null || _d === void 0 ? void 0 : _d.statusCode,
        context: { function: funcName },
    });
}
/**
 * Calls the GCG API to generate a signed upload URL that
 * function code can be uploaded to.
 * @param projectId The ID of the project being deployed to.
 * @param location The region to used for generating an upload URL.
 */
async function generateUploadUrl(projectId, location) {
    const parent = "projects/" + projectId + "/locations/" + location;
    const endpoint = `/${parent}/functions:generateUploadUrl`;
    try {
        const res = await client.post(endpoint, {}, { retryCodes: [503] });
        return res.body.uploadUrl;
    }
    catch (err) {
        logger_1.logger.info("\n\nThere was an issue deploying your functions. Verify that your project has a Google App Engine instance setup at https://console.cloud.google.com/appengine and try again. If this issue persists, please contact support.");
        throw err;
    }
}
exports.generateUploadUrl = generateUploadUrl;
/**
 * Create a Cloud Function.
 * @param cloudFunction The function to delete
 */
async function createFunction(cloudFunction) {
    // the API is a POST to the collection that owns the function name.
    const apiPath = cloudFunction.name.substring(0, cloudFunction.name.lastIndexOf("/"));
    const endpoint = `/${apiPath}`;
    cloudFunction.buildEnvironmentVariables = Object.assign(Object.assign({}, cloudFunction.buildEnvironmentVariables), { 
        // Disable GCF from automatically running npm run build script
        // https://cloud.google.com/functions/docs/release-notes
        GOOGLE_NODE_RUN_SCRIPTS: "" });
    try {
        const res = await client.post(endpoint, cloudFunction);
        return {
            name: res.body.name,
            type: "create",
            done: false,
        };
    }
    catch (err) {
        throw functionsOpLogReject(cloudFunction.name, "create", err);
    }
}
exports.createFunction = createFunction;
/**
 * Sets the IAM policy of a Google Cloud Function.
 * @param options The Iam options to set.
 */
async function setIamPolicy(options) {
    var _a, _b;
    const endpoint = `/${options.name}:setIamPolicy`;
    try {
        await client.post(endpoint, {
            policy: options.policy,
            updateMask: Object.keys(options.policy).join(","),
        });
    }
    catch (err) {
        throw new error_1.FirebaseError(`Failed to set the IAM Policy on the function ${options.name}`, {
            original: err,
            status: (_b = (_a = err === null || err === void 0 ? void 0 : err.context) === null || _a === void 0 ? void 0 : _a.response) === null || _b === void 0 ? void 0 : _b.statusCode,
        });
    }
}
exports.setIamPolicy = setIamPolicy;
/**
 * Gets the IAM policy of a Google Cloud Function.
 * @param fnName The full name and path of the Cloud Function.
 */
async function getIamPolicy(fnName) {
    const endpoint = `/${fnName}:getIamPolicy`;
    try {
        const res = await client.get(endpoint);
        return res.body;
    }
    catch (err) {
        throw new error_1.FirebaseError(`Failed to get the IAM Policy on the function ${fnName}`, {
            original: err,
        });
    }
}
exports.getIamPolicy = getIamPolicy;
/**
 * Sets the invoker IAM policy for the function on function create
 * @param projectId id of the project
 * @param fnName function name
 * @param invoker an array of invoker strings
 * @throws {@link FirebaseError} on an empty invoker, when the IAM Polciy fails to be grabbed or set
 */
async function setInvokerCreate(projectId, fnName, invoker) {
    if (invoker.length === 0) {
        throw new error_1.FirebaseError("Invoker cannot be an empty array");
    }
    const invokerMembers = proto.getInvokerMembers(invoker, projectId);
    const invokerRole = "roles/cloudfunctions.invoker";
    const bindings = [{ role: invokerRole, members: invokerMembers }];
    const policy = {
        bindings: bindings,
        etag: "",
        version: 3,
    };
    await setIamPolicy({ name: fnName, policy: policy });
}
exports.setInvokerCreate = setInvokerCreate;
/**
 * Gets the current IAM policy on function update,
 * overrides the current invoker role with the supplied invoker members
 * @param projectId id of the project
 * @param fnName function name
 * @param invoker an array of invoker strings
 * @throws {@link FirebaseError} on an empty invoker, when the IAM Polciy fails to be grabbed or set
 */
async function setInvokerUpdate(projectId, fnName, invoker) {
    var _a;
    if (invoker.length === 0) {
        throw new error_1.FirebaseError("Invoker cannot be an empty array");
    }
    const invokerMembers = proto.getInvokerMembers(invoker, projectId);
    const invokerRole = "roles/cloudfunctions.invoker";
    const currentPolicy = await getIamPolicy(fnName);
    const currentInvokerBinding = (_a = currentPolicy.bindings) === null || _a === void 0 ? void 0 : _a.find((binding) => binding.role === invokerRole);
    if (currentInvokerBinding &&
        JSON.stringify(currentInvokerBinding.members.sort()) === JSON.stringify(invokerMembers.sort())) {
        return;
    }
    const bindings = (currentPolicy.bindings || []).filter((binding) => binding.role !== invokerRole);
    bindings.push({
        role: invokerRole,
        members: invokerMembers,
    });
    const policy = {
        bindings: bindings,
        etag: currentPolicy.etag || "",
        version: 3,
    };
    await setIamPolicy({ name: fnName, policy: policy });
}
exports.setInvokerUpdate = setInvokerUpdate;
/**
 * Updates a Cloud Function.
 * @param cloudFunction The Cloud Function to update.
 */
async function updateFunction(cloudFunction) {
    const endpoint = `/${cloudFunction.name}`;
    cloudFunction.buildEnvironmentVariables = Object.assign(Object.assign({}, cloudFunction.buildEnvironmentVariables), { 
        // Disable GCF from automatically running npm run build script
        // https://cloud.google.com/functions/docs/release-notes
        GOOGLE_NODE_RUN_SCRIPTS: "" });
    // Keys in labels and environmentVariables and secretEnvironmentVariables are user defined,
    // so we don't recurse for field masks.
    const fieldMasks = proto.fieldMasks(cloudFunction, 
    /* doNotRecurseIn...=*/ "labels", "environmentVariables", "secretEnvironmentVariables", "buildEnvironmentVariables");
    // Failure policy is always an explicit policy and is only signified by the presence or absence of
    // a protobuf.Empty value, so we have to manually add it in the missing case.
    try {
        const res = await client.patch(endpoint, cloudFunction, {
            queryParams: {
                updateMask: fieldMasks.join(","),
            },
        });
        return {
            done: false,
            name: res.body.name,
            type: "update",
        };
    }
    catch (err) {
        throw functionsOpLogReject(cloudFunction.name, "update", err);
    }
}
exports.updateFunction = updateFunction;
/**
 * Delete a Cloud Function.
 * @param options the Cloud Function to delete.
 */
async function deleteFunction(name) {
    const endpoint = `/${name}`;
    try {
        const res = await client.delete(endpoint);
        return {
            done: false,
            name: res.body.name,
            type: "delete",
        };
    }
    catch (err) {
        throw functionsOpLogReject(name, "delete", err);
    }
}
exports.deleteFunction = deleteFunction;
async function list(projectId, region) {
    const endpoint = "/projects/" + projectId + "/locations/" + region + "/functions";
    try {
        const res = await client.get(endpoint);
        if (res.body.unreachable && res.body.unreachable.length > 0) {
            logger_1.logger.debug(`[functions] unable to reach the following regions: ${res.body.unreachable.join(", ")}`);
        }
        return {
            functions: res.body.functions || [],
            unreachable: res.body.unreachable || [],
        };
    }
    catch (err) {
        logger_1.logger.debug(`[functions] failed to list functions for ${projectId}`);
        logger_1.logger.debug(`[functions] ${err === null || err === void 0 ? void 0 : err.message}`);
        throw new error_1.FirebaseError(`Failed to list functions for ${projectId}`, {
            original: err,
            status: err instanceof error_1.FirebaseError ? err.status : undefined,
        });
    }
}
/**
 * List all existing Cloud Functions in a project.
 * @param projectId the Id of the project to check.
 */
async function listAllFunctions(projectId) {
    // "-" instead of a region string lists functions in all regions
    return list(projectId, "-");
}
exports.listAllFunctions = listAllFunctions;
/**
 * Converts a Cloud Function from the v1 API into a version-agnostic FunctionSpec struct.
 * This API exists outside the GCF namespace because GCF returns an Operation<CloudFunction>
 * and code may have to call this method explicitly.
 */
function endpointFromFunction(gcfFunction) {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    const [, project, , region, , id] = gcfFunction.name.split("/");
    let trigger;
    let uri;
    let securityLevel;
    if ((_a = gcfFunction.labels) === null || _a === void 0 ? void 0 : _a["deployment-scheduled"]) {
        trigger = {
            scheduleTrigger: {},
        };
    }
    else if ((_b = gcfFunction.labels) === null || _b === void 0 ? void 0 : _b["deployment-taskqueue"]) {
        trigger = {
            taskQueueTrigger: {},
        };
    }
    else if (((_c = gcfFunction.labels) === null || _c === void 0 ? void 0 : _c["deployment-callable"]) ||
        (
        // NOTE: "deployment-callabled" is a typo we introduced in https://github.com/firebase/firebase-tools/pull/4124.
        // More than a month passed before we caught this typo, and we expect many callable functions in production
        // to have this typo. It is convenient for users for us to treat the typo-ed label as a valid marker for callable
        // function, so we do that here.
        //
        // The typo will be overwritten as callable functions are re-deployed. Eventually, there may be no callable
        // functions with the typo-ed label, but we can't ever be sure. Sadly, we may have to carry this scar for a very long
        // time.
        (_d = gcfFunction.labels) === null || _d === void 0 ? void 0 : _d["deployment-callabled"])) {
        trigger = {
            callableTrigger: {},
        };
    }
    else if ((_e = gcfFunction.labels) === null || _e === void 0 ? void 0 : _e[constants_1.BLOCKING_LABEL]) {
        trigger = {
            blockingTrigger: {
                eventType: constants_1.BLOCKING_LABEL_KEY_TO_EVENT[gcfFunction.labels[constants_1.BLOCKING_LABEL]],
            },
        };
    }
    else if (gcfFunction.httpsTrigger) {
        trigger = { httpsTrigger: {} };
    }
    else {
        trigger = {
            eventTrigger: {
                eventType: gcfFunction.eventTrigger.eventType,
                eventFilters: { resource: gcfFunction.eventTrigger.resource },
                retry: !!((_f = gcfFunction.eventTrigger.failurePolicy) === null || _f === void 0 ? void 0 : _f.retry),
            },
        };
    }
    if (gcfFunction.httpsTrigger) {
        uri = gcfFunction.httpsTrigger.url;
        securityLevel = gcfFunction.httpsTrigger.securityLevel;
    }
    if (!supported.isRuntime(gcfFunction.runtime)) {
        logger_1.logger.debug("GCF 1st gen function has unsupported runtime:", JSON.stringify(gcfFunction, null, 2));
    }
    const endpoint = Object.assign(Object.assign({ platform: "gcfv1", id,
        project,
        region }, trigger), { entryPoint: gcfFunction.entryPoint, runtime: gcfFunction.runtime });
    if (uri) {
        endpoint.uri = uri;
    }
    if (securityLevel) {
        endpoint.securityLevel = securityLevel;
    }
    proto.copyIfPresent(endpoint, gcfFunction, "minInstances", "maxInstances", "ingressSettings", "labels", "environmentVariables", "secretEnvironmentVariables", "sourceUploadUrl");
    proto.renameIfPresent(endpoint, gcfFunction, "serviceAccount", "serviceAccountEmail");
    proto.convertIfPresent(endpoint, gcfFunction, "availableMemoryMb", (raw) => raw);
    proto.convertIfPresent(endpoint, gcfFunction, "timeoutSeconds", "timeout", (dur) => dur === null ? null : proto.secondsFromDuration(dur));
    if (gcfFunction.vpcConnector) {
        endpoint.vpc = { connector: gcfFunction.vpcConnector };
        proto.convertIfPresent(endpoint.vpc, gcfFunction, "egressSettings", "vpcConnectorEgressSettings", (raw) => raw);
    }
    endpoint.codebase = ((_g = gcfFunction.labels) === null || _g === void 0 ? void 0 : _g[constants_1.CODEBASE_LABEL]) || projectConfig.DEFAULT_CODEBASE;
    if ((_h = gcfFunction.labels) === null || _h === void 0 ? void 0 : _h[constants_1.HASH_LABEL]) {
        endpoint.hash = gcfFunction.labels[constants_1.HASH_LABEL];
    }
    proto.convertIfPresent(endpoint, gcfFunction, "state", "status", (status) => {
        if (status === "ACTIVE") {
            return "ACTIVE";
        }
        else if (status === "OFFLINE") {
            return "FAILED";
        }
        else if (status === "DEPLOY_IN_PROGRESS") {
            return "DEPLOYING";
        }
        else if (status === "DELETE_IN_PROGRESS") {
            return "DELETING";
        }
        return "UNKONWN";
    });
    return endpoint;
}
exports.endpointFromFunction = endpointFromFunction;
/**
 * Convert the API agnostic FunctionSpec struct to a CloudFunction proto for the v1 API.
 */
function functionFromEndpoint(endpoint, sourceUploadUrl) {
    var _a, _b;
    if (endpoint.platform !== "gcfv1") {
        throw new error_1.FirebaseError("Trying to create a v1 CloudFunction with v2 API. This should never happen");
    }
    if (!supported.isRuntime(endpoint.runtime)) {
        throw new error_1.FirebaseError("Failed internal assertion. Trying to deploy a new function with a deprecated runtime." +
            " This should never happen", { exit: 1 });
    }
    const gcfFunction = {
        name: backend.functionName(endpoint),
        sourceUploadUrl: sourceUploadUrl,
        entryPoint: endpoint.entryPoint,
        runtime: endpoint.runtime,
        dockerRegistry: "ARTIFACT_REGISTRY",
    };
    // N.B. It has the same effect to set labels to the empty object as it does to
    // set it to null, except the former is more effective for adding automatic
    // lables for things like deployment-callable
    if (typeof endpoint.labels !== "undefined") {
        gcfFunction.labels = Object.assign({}, endpoint.labels);
    }
    if (backend.isEventTriggered(endpoint)) {
        if (!((_a = endpoint.eventTrigger.eventFilters) === null || _a === void 0 ? void 0 : _a.resource)) {
            throw new error_1.FirebaseError("Cannot create v1 function from an eventTrigger without a resource");
        }
        gcfFunction.eventTrigger = {
            eventType: endpoint.eventTrigger.eventType,
            resource: endpoint.eventTrigger.eventFilters.resource,
            // Service is unnecessary and deprecated
        };
        // For field masks to pick up a deleted failure policy we must inject an undefined
        // when retry is false
        gcfFunction.eventTrigger.failurePolicy = endpoint.eventTrigger.retry
            ? { retry: {} }
            : undefined;
    }
    else if (backend.isScheduleTriggered(endpoint)) {
        const id = backend.scheduleIdForFunction(endpoint);
        gcfFunction.eventTrigger = {
            eventType: "google.pubsub.topic.publish",
            resource: `projects/${endpoint.project}/topics/${id}`,
        };
        gcfFunction.labels = Object.assign(Object.assign({}, gcfFunction.labels), { "deployment-scheduled": "true" });
    }
    else if (backend.isTaskQueueTriggered(endpoint)) {
        gcfFunction.httpsTrigger = {};
        gcfFunction.labels = Object.assign(Object.assign({}, gcfFunction.labels), { "deployment-taskqueue": "true" });
    }
    else if (backend.isBlockingTriggered(endpoint)) {
        gcfFunction.httpsTrigger = {};
        gcfFunction.labels = Object.assign(Object.assign({}, gcfFunction.labels), { [constants_1.BLOCKING_LABEL]: constants_1.BLOCKING_EVENT_TO_LABEL_KEY[endpoint.blockingTrigger.eventType] });
    }
    else {
        gcfFunction.httpsTrigger = {};
        if (backend.isCallableTriggered(endpoint)) {
            gcfFunction.labels = Object.assign(Object.assign({}, gcfFunction.labels), { "deployment-callable": "true" });
        }
        if (endpoint.securityLevel) {
            gcfFunction.httpsTrigger.securityLevel = endpoint.securityLevel;
        }
    }
    proto.copyIfPresent(gcfFunction, endpoint, "minInstances", "maxInstances", "ingressSettings", "environmentVariables", "secretEnvironmentVariables");
    proto.convertIfPresent(gcfFunction, endpoint, "serviceAccountEmail", "serviceAccount", (from) => !from ? null : proto.formatServiceAccount(from, endpoint.project, true /* removeTypePrefix */));
    proto.convertIfPresent(gcfFunction, endpoint, "availableMemoryMb", (mem) => mem);
    proto.convertIfPresent(gcfFunction, endpoint, "timeout", "timeoutSeconds", (sec) => sec ? proto.durationFromSeconds(sec) : null);
    if (endpoint.vpc) {
        proto.renameIfPresent(gcfFunction, endpoint.vpc, "vpcConnector", "connector");
        proto.renameIfPresent(gcfFunction, endpoint.vpc, "vpcConnectorEgressSettings", "egressSettings");
    }
    else if (endpoint.vpc === null) {
        gcfFunction.vpcConnector = null;
        gcfFunction.vpcConnectorEgressSettings = null;
    }
    const codebase = endpoint.codebase || projectConfig.DEFAULT_CODEBASE;
    if (codebase !== projectConfig.DEFAULT_CODEBASE) {
        gcfFunction.labels = Object.assign(Object.assign({}, gcfFunction.labels), { [constants_1.CODEBASE_LABEL]: codebase });
    }
    else {
        (_b = gcfFunction.labels) === null || _b === void 0 ? true : delete _b[constants_1.CODEBASE_LABEL];
    }
    if (endpoint.hash) {
        gcfFunction.labels = Object.assign(Object.assign({}, gcfFunction.labels), { [constants_1.HASH_LABEL]: endpoint.hash });
    }
    return gcfFunction;
}
exports.functionFromEndpoint = functionFromEndpoint;
