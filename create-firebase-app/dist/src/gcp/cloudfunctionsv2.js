"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.endpointFromFunction = exports.functionFromEndpoint = exports.deleteFunction = exports.updateFunction = exports.listAllFunctions = exports.getFunction = exports.createFunction = exports.generateUploadUrl = exports.API_VERSION = void 0;
const apiv2_1 = require("../apiv2");
const error_1 = require("../error");
const api_1 = require("../api");
const logger_1 = require("../logger");
const v2_1 = require("../functions/events/v2");
const backend = require("../deploy/functions/backend");
const supported = require("../deploy/functions/runtimes/supported");
const proto = require("./proto");
const utils = require("../utils");
const projectConfig = require("../functions/projectConfig");
const constants_1 = require("../functions/constants");
const cloudfunctions_1 = require("./cloudfunctions");
const k8s_1 = require("./k8s");
exports.API_VERSION = "v2";
// Defined by Cloud Run: https://cloud.google.com/run/docs/configuring/max-instances#setting
const DEFAULT_MAX_INSTANCE_COUNT = 100;
const client = new apiv2_1.Client({
    urlPrefix: (0, api_1.functionsV2Origin)(),
    auth: true,
    apiVersion: exports.API_VERSION,
});
/**
 * Logs an error from a failed function deployment.
 * @param func The function that was unsuccessfully deployed.
 * @param type Type of deployment - create, update, or delete.
 * @param err The error returned from the operation.
 */
function functionsOpLogReject(func, type, err) {
    var _a, _b, _c, _d, _e, _f, _g;
    // Sniff for runtime validation errors and log a more user-friendly warning.
    if ((_a = err === null || err === void 0 ? void 0 : err.message) === null || _a === void 0 ? void 0 : _a.includes("Runtime validation errors")) {
        const capturedMessage = (0, cloudfunctions_1.captureRuntimeValidationError)(err.message);
        utils.logLabeledWarning("functions", capturedMessage + " for function " + func.name);
    }
    if ((_b = err === null || err === void 0 ? void 0 : err.message) === null || _b === void 0 ? void 0 : _b.includes("maxScale may not exceed")) {
        const maxInstances = func.serviceConfig.maxInstanceCount || DEFAULT_MAX_INSTANCE_COUNT;
        utils.logLabeledWarning("functions", `Your current project quotas don't allow for the current max instances setting of ${maxInstances}. ` +
            "Either reduce this function's maximum instances, or request a quota increase on the underlying Cloud Run service " +
            "at https://cloud.google.com/run/quotas.");
        const suggestedFix = func.buildConfig.runtime.startsWith("python")
            ? "firebase_functions.options.set_global_options(max_instances=10)"
            : "setGlobalOptions({maxInstances: 10})";
        utils.logLabeledWarning("functions", `You can adjust the max instances value in your function's runtime options:\n\t${suggestedFix}`);
    }
    else {
        utils.logLabeledWarning("functions", `${err === null || err === void 0 ? void 0 : err.message}`);
        if (((_d = (_c = err === null || err === void 0 ? void 0 : err.context) === null || _c === void 0 ? void 0 : _c.response) === null || _d === void 0 ? void 0 : _d.statusCode) === 429) {
            utils.logLabeledWarning("functions", `Got "Quota Exceeded" error while trying to ${type} ${func.name}. Waiting to retry...`);
        }
        else if ((_e = err === null || err === void 0 ? void 0 : err.message) === null || _e === void 0 ? void 0 : _e.includes("If you recently started to use Eventarc, it may take a few minutes before all necessary permissions are propagated to the Service Agent")) {
            utils.logLabeledWarning("functions", `Since this is your first time using 2nd gen functions, we need a little bit longer to finish setting everything up. Retry the deployment in a few minutes.`);
        }
        utils.logLabeledWarning("functions", ` failed to ${type} function ${func.name}`);
    }
    throw new error_1.FirebaseError(`Failed to ${type} function ${func.name}`, {
        original: err,
        status: (_g = (_f = err === null || err === void 0 ? void 0 : err.context) === null || _f === void 0 ? void 0 : _f.response) === null || _g === void 0 ? void 0 : _g.statusCode,
        context: { function: func.name },
    });
}
/**
 * Creates an upload URL and pre-provisions a StorageSource.
 */
async function generateUploadUrl(projectId, location) {
    try {
        const res = await client.post(`projects/${projectId}/locations/${location}/functions:generateUploadUrl`);
        return res.body;
    }
    catch (err) {
        logger_1.logger.info("\n\nThere was an issue deploying your functions. Verify that your project has a Google App Engine instance setup at https://console.cloud.google.com/appengine and try again. If this issue persists, please contact support.");
        throw err;
    }
}
exports.generateUploadUrl = generateUploadUrl;
/**
 * Creates a new Cloud Function.
 */
async function createFunction(cloudFunction) {
    // the API is a POST to the collection that owns the function name.
    const components = cloudFunction.name.split("/");
    const functionId = components.splice(-1, 1)[0];
    cloudFunction.buildConfig.environmentVariables = Object.assign(Object.assign({}, cloudFunction.buildConfig.environmentVariables), { 
        // Disable GCF from automatically running npm run build script
        // https://cloud.google.com/functions/docs/release-notes
        GOOGLE_NODE_RUN_SCRIPTS: "" });
    cloudFunction.serviceConfig.environmentVariables = Object.assign(Object.assign({}, cloudFunction.serviceConfig.environmentVariables), { FUNCTION_TARGET: cloudFunction.buildConfig.entryPoint.replaceAll("-", "."), 
        // Enable logging execution id by default for better debugging
        LOG_EXECUTION_ID: "true" });
    try {
        const res = await client.post(components.join("/"), cloudFunction, { queryParams: { functionId } });
        return res.body;
    }
    catch (err) {
        throw functionsOpLogReject(cloudFunction, "create", err);
    }
}
exports.createFunction = createFunction;
/**
 * Gets the definition of a Cloud Function
 */
async function getFunction(projectId, location, functionId) {
    const name = `projects/${projectId}/locations/${location}/functions/${functionId}`;
    const res = await client.get(name);
    return res.body;
}
exports.getFunction = getFunction;
/**
 *  List all functions in all regions
 *  Customers should generally use backend.existingBackend and backend.checkAvailability.
 */
async function listAllFunctions(projectId) {
    return await listFunctionsInternal(projectId, /* region=*/ "-");
}
exports.listAllFunctions = listAllFunctions;
async function listFunctionsInternal(projectId, region) {
    const functions = [];
    const unreacahble = new Set();
    let pageToken = "";
    while (true) {
        const url = `projects/${projectId}/locations/${region}/functions`;
        // V2 API returns both V1 and V2 Functions. Add filter condition to return only V2 functions.
        const opts = { queryParams: { filter: `environment="GEN_2"` } };
        if (pageToken !== "") {
            opts.queryParams = Object.assign(Object.assign({}, opts.queryParams), { pageToken });
        }
        const res = await client.get(url, opts);
        functions.push(...(res.body.functions || []));
        for (const region of res.body.unreachable || []) {
            unreacahble.add(region);
        }
        if (!res.body.nextPageToken) {
            return {
                functions,
                unreachable: Array.from(unreacahble),
            };
        }
        pageToken = res.body.nextPageToken;
    }
}
/**
 * Updates a Cloud Function.
 * Customers can force a field to be deleted by setting that field to `undefined`
 */
async function updateFunction(cloudFunction) {
    cloudFunction.buildConfig.environmentVariables = Object.assign(Object.assign({}, cloudFunction.buildConfig.environmentVariables), { 
        // Disable GCF from automatically running npm run build script
        // https://cloud.google.com/functions/docs/release-notes
        GOOGLE_NODE_RUN_SCRIPTS: "" });
    cloudFunction.serviceConfig.environmentVariables = Object.assign(Object.assign({}, cloudFunction.serviceConfig.environmentVariables), { FUNCTION_TARGET: cloudFunction.buildConfig.entryPoint.replaceAll("-", "."), 
        // Enable logging execution id by default for better debugging
        LOG_EXECUTION_ID: "true" });
    // Keys in labels and environmentVariables and secretEnvironmentVariables are user defined, so we don't recurse
    // for field masks.
    const fieldMasks = proto.fieldMasks(cloudFunction, 
    /* doNotRecurseIn...=*/ "labels", "serviceConfig.environmentVariables", "serviceConfig.secretEnvironmentVariables", "buildConfig.environmentVariables");
    try {
        const queryParams = {
            updateMask: fieldMasks.join(","),
        };
        const res = await client.patch(cloudFunction.name, cloudFunction, { queryParams });
        return res.body;
    }
    catch (err) {
        throw functionsOpLogReject(cloudFunction, "update", err);
    }
}
exports.updateFunction = updateFunction;
/**
 * Deletes a Cloud Function.
 * It is safe, but should be unnecessary, to delete a Cloud Function by just its name.
 */
async function deleteFunction(cloudFunction) {
    try {
        const res = await client.delete(cloudFunction);
        return res.body;
    }
    catch (err) {
        throw functionsOpLogReject({ name: cloudFunction }, "update", err);
    }
}
exports.deleteFunction = deleteFunction;
/**
 * Generate a v2 Cloud Function API object from a versionless Endpoint object.
 */
function functionFromEndpoint(endpoint) {
    var _a, _b, _c;
    if (endpoint.platform !== "gcfv2") {
        throw new error_1.FirebaseError("Trying to create a v2 CloudFunction with v1 API. This should never happen");
    }
    if (!supported.isRuntime(endpoint.runtime)) {
        throw new error_1.FirebaseError("Failed internal assertion. Trying to deploy a new function with a deprecated runtime." +
            " This should never happen");
    }
    const gcfFunction = {
        name: backend.functionName(endpoint),
        buildConfig: {
            runtime: endpoint.runtime,
            entryPoint: endpoint.entryPoint,
            source: {
                storageSource: (_a = endpoint.source) === null || _a === void 0 ? void 0 : _a.storageSource,
            },
            // We don't use build environment variables,
            environmentVariables: {},
        },
        serviceConfig: {},
    };
    proto.copyIfPresent(gcfFunction, endpoint, "labels");
    proto.copyIfPresent(gcfFunction.serviceConfig, endpoint, "environmentVariables", "secretEnvironmentVariables", "ingressSettings", "timeoutSeconds");
    proto.convertIfPresent(gcfFunction.serviceConfig, endpoint, "serviceAccountEmail", "serviceAccount", (from) => !from
        ? null
        : proto.formatServiceAccount(from, endpoint.project, true /* removeTypePrefix */));
    // Memory must be set because the default value of GCF gen 2 is Megabytes and
    // we use mebibytes
    const mem = endpoint.availableMemoryMb || backend.DEFAULT_MEMORY;
    gcfFunction.serviceConfig.availableMemory = mem > 1024 ? `${mem / 1024}Gi` : `${mem}Mi`;
    proto.renameIfPresent(gcfFunction.serviceConfig, endpoint, "minInstanceCount", "minInstances");
    proto.renameIfPresent(gcfFunction.serviceConfig, endpoint, "maxInstanceCount", "maxInstances");
    // N.B. only convert CPU and concurrency fields for 2nd gen functions, once we
    // eventually use the v2 API to configure both 1st and 2nd gen functions)
    proto.renameIfPresent(gcfFunction.serviceConfig, endpoint, "maxInstanceRequestConcurrency", "concurrency");
    proto.convertIfPresent(gcfFunction.serviceConfig, endpoint, "availableCpu", "cpu", (cpu) => {
        return String(cpu);
    });
    if (endpoint.vpc) {
        proto.renameIfPresent(gcfFunction.serviceConfig, endpoint.vpc, "vpcConnector", "connector");
        proto.renameIfPresent(gcfFunction.serviceConfig, endpoint.vpc, "vpcConnectorEgressSettings", "egressSettings");
    }
    else if (endpoint.vpc === null) {
        gcfFunction.serviceConfig.vpcConnector = null;
        gcfFunction.serviceConfig.vpcConnectorEgressSettings = null;
    }
    if (backend.isEventTriggered(endpoint)) {
        gcfFunction.eventTrigger = {
            eventType: endpoint.eventTrigger.eventType,
            retryPolicy: "RETRY_POLICY_UNSPECIFIED",
        };
        if (gcfFunction.serviceConfig.serviceAccountEmail) {
            gcfFunction.eventTrigger.serviceAccountEmail = gcfFunction.serviceConfig.serviceAccountEmail;
        }
        if (gcfFunction.eventTrigger.eventType === v2_1.PUBSUB_PUBLISH_EVENT) {
            if (!((_b = endpoint.eventTrigger.eventFilters) === null || _b === void 0 ? void 0 : _b.topic)) {
                throw new error_1.FirebaseError("Error: Pub/Sub event trigger is missing topic: " +
                    JSON.stringify(endpoint.eventTrigger, null, 2));
            }
            gcfFunction.eventTrigger.pubsubTopic = endpoint.eventTrigger.eventFilters.topic;
            gcfFunction.eventTrigger.eventFilters = [];
            for (const [attribute, value] of Object.entries(endpoint.eventTrigger.eventFilters)) {
                if (attribute === "topic")
                    continue;
                gcfFunction.eventTrigger.eventFilters.push({ attribute, value });
            }
        }
        else {
            gcfFunction.eventTrigger.eventFilters = [];
            for (const [attribute, value] of Object.entries(endpoint.eventTrigger.eventFilters || {})) {
                gcfFunction.eventTrigger.eventFilters.push({ attribute, value });
            }
            for (const [attribute, value] of Object.entries(endpoint.eventTrigger.eventFilterPathPatterns || {})) {
                gcfFunction.eventTrigger.eventFilters.push({
                    attribute,
                    value,
                    operator: "match-path-pattern",
                });
            }
        }
        proto.renameIfPresent(gcfFunction.eventTrigger, endpoint.eventTrigger, "triggerRegion", "region");
        proto.copyIfPresent(gcfFunction.eventTrigger, endpoint.eventTrigger, "channel");
        endpoint.eventTrigger.retry
            ? (gcfFunction.eventTrigger.retryPolicy = "RETRY_POLICY_RETRY")
            : (gcfFunction.eventTrigger.retryPolicy = "RETRY_POLICY_DO_NOT_RETRY");
        // By default, Functions Framework in GCFv2 opts to downcast incoming cloudevent messages to legacy formats.
        // Since Firebase Functions SDK expects messages in cloudevent format, we set FUNCTION_SIGNATURE_TYPE to tell
        // Functions Framework to disable downcast before passing the cloudevent message to function handler.
        // See https://github.com/GoogleCloudPlatform/functions-framework-nodejs/blob/master/README.md#configure-the-functions-
        gcfFunction.serviceConfig.environmentVariables = Object.assign(Object.assign({}, gcfFunction.serviceConfig.environmentVariables), { FUNCTION_SIGNATURE_TYPE: "cloudevent" });
    }
    else if (backend.isScheduleTriggered(endpoint)) {
        // trigger type defaults to HTTPS.
        gcfFunction.labels = Object.assign(Object.assign({}, gcfFunction.labels), { "deployment-scheduled": "true" });
    }
    else if (backend.isTaskQueueTriggered(endpoint)) {
        gcfFunction.labels = Object.assign(Object.assign({}, gcfFunction.labels), { "deployment-taskqueue": "true" });
    }
    else if (backend.isCallableTriggered(endpoint)) {
        gcfFunction.labels = Object.assign(Object.assign({}, gcfFunction.labels), { "deployment-callable": "true" });
        if (endpoint.callableTrigger.genkitAction) {
            gcfFunction.labels["genkit-action"] = "true";
        }
    }
    else if (backend.isBlockingTriggered(endpoint)) {
        gcfFunction.labels = Object.assign(Object.assign({}, gcfFunction.labels), { [constants_1.BLOCKING_LABEL]: constants_1.BLOCKING_EVENT_TO_LABEL_KEY[endpoint.blockingTrigger.eventType] });
    }
    const codebase = endpoint.codebase || projectConfig.DEFAULT_CODEBASE;
    if (codebase !== projectConfig.DEFAULT_CODEBASE) {
        gcfFunction.labels = Object.assign(Object.assign({}, gcfFunction.labels), { [constants_1.CODEBASE_LABEL]: codebase });
    }
    else {
        (_c = gcfFunction.labels) === null || _c === void 0 ? true : delete _c[constants_1.CODEBASE_LABEL];
    }
    if (endpoint.hash) {
        gcfFunction.labels = Object.assign(Object.assign({}, gcfFunction.labels), { [constants_1.HASH_LABEL]: endpoint.hash });
    }
    return gcfFunction;
}
exports.functionFromEndpoint = functionFromEndpoint;
/**
 * Generate a versionless Endpoint object from a v2 Cloud Function API object.
 */
function endpointFromFunction(gcfFunction) {
    var _a, _b, _c, _d, _e, _f;
    const [, project, , region, , id] = gcfFunction.name.split("/");
    let trigger;
    if (((_a = gcfFunction.labels) === null || _a === void 0 ? void 0 : _a["deployment-scheduled"]) === "true") {
        trigger = {
            scheduleTrigger: {},
        };
    }
    else if (((_b = gcfFunction.labels) === null || _b === void 0 ? void 0 : _b["deployment-taskqueue"]) === "true") {
        trigger = {
            taskQueueTrigger: {},
        };
    }
    else if (((_c = gcfFunction.labels) === null || _c === void 0 ? void 0 : _c["deployment-callable"]) === "true") {
        trigger = {
            callableTrigger: {},
        };
    }
    else if ((_d = gcfFunction.labels) === null || _d === void 0 ? void 0 : _d[constants_1.BLOCKING_LABEL]) {
        trigger = {
            blockingTrigger: {
                eventType: constants_1.BLOCKING_LABEL_KEY_TO_EVENT[gcfFunction.labels[constants_1.BLOCKING_LABEL]],
            },
        };
    }
    else if (gcfFunction.eventTrigger) {
        const eventFilters = {};
        const eventFilterPathPatterns = {};
        if (gcfFunction.eventTrigger.pubsubTopic &&
            gcfFunction.eventTrigger.eventType === v2_1.PUBSUB_PUBLISH_EVENT) {
            eventFilters.topic = gcfFunction.eventTrigger.pubsubTopic;
        }
        else {
            for (const eventFilter of gcfFunction.eventTrigger.eventFilters || []) {
                if (eventFilter.operator === "match-path-pattern") {
                    eventFilterPathPatterns[eventFilter.attribute] = eventFilter.value;
                }
                else {
                    eventFilters[eventFilter.attribute] = eventFilter.value;
                }
            }
        }
        trigger = {
            eventTrigger: {
                eventType: gcfFunction.eventTrigger.eventType,
                retry: gcfFunction.eventTrigger.retryPolicy === "RETRY_POLICY_RETRY" ? true : false,
            },
        };
        if (Object.keys(eventFilters).length) {
            trigger.eventTrigger.eventFilters = eventFilters;
        }
        if (Object.keys(eventFilterPathPatterns).length) {
            trigger.eventTrigger.eventFilterPathPatterns = eventFilterPathPatterns;
        }
        proto.copyIfPresent(trigger.eventTrigger, gcfFunction.eventTrigger, "channel");
        proto.renameIfPresent(trigger.eventTrigger, gcfFunction.eventTrigger, "region", "triggerRegion");
    }
    else {
        trigger = { httpsTrigger: {} };
    }
    if (!supported.isRuntime(gcfFunction.buildConfig.runtime)) {
        logger_1.logger.debug("GCFv2 function has a deprecated runtime:", JSON.stringify(gcfFunction, null, 2));
    }
    const endpoint = Object.assign(Object.assign({ platform: "gcfv2", id,
        project,
        region }, trigger), { entryPoint: gcfFunction.buildConfig.entryPoint, runtime: gcfFunction.buildConfig.runtime, source: gcfFunction.buildConfig.source });
    if (gcfFunction.serviceConfig) {
        proto.copyIfPresent(endpoint, gcfFunction.serviceConfig, "ingressSettings", "environmentVariables", "secretEnvironmentVariables", "timeoutSeconds", "uri");
        proto.renameIfPresent(endpoint, gcfFunction.serviceConfig, "serviceAccount", "serviceAccountEmail");
        proto.convertIfPresent(endpoint, gcfFunction.serviceConfig, "availableMemoryMb", "availableMemory", (prod) => {
            if (prod === null) {
                logger_1.logger.debug("Prod should always return a valid memory amount");
                return prod;
            }
            const mem = (0, k8s_1.mebibytes)(prod);
            if (!backend.isValidMemoryOption(mem)) {
                logger_1.logger.debug("Converting a function to an endpoint with an invalid memory option", mem);
            }
            return mem;
        });
        proto.convertIfPresent(endpoint, gcfFunction.serviceConfig, "cpu", "availableCpu", (cpu) => {
            let cpuVal = Number(cpu);
            if (Number.isNaN(cpuVal)) {
                cpuVal = null;
            }
            return cpuVal;
        });
        proto.renameIfPresent(endpoint, gcfFunction.serviceConfig, "minInstances", "minInstanceCount");
        proto.renameIfPresent(endpoint, gcfFunction.serviceConfig, "maxInstances", "maxInstanceCount");
        proto.renameIfPresent(endpoint, gcfFunction.serviceConfig, "concurrency", "maxInstanceRequestConcurrency");
        proto.copyIfPresent(endpoint, gcfFunction, "labels");
        if (gcfFunction.serviceConfig.vpcConnector) {
            endpoint.vpc = { connector: gcfFunction.serviceConfig.vpcConnector };
            proto.renameIfPresent(endpoint.vpc, gcfFunction.serviceConfig, "egressSettings", "vpcConnectorEgressSettings");
        }
        const serviceName = gcfFunction.serviceConfig.service;
        if (!serviceName) {
            logger_1.logger.debug("Got a v2 function without a service name." +
                "Maybe we've migrated to using the v2 API everywhere and missed this code");
        }
        else {
            endpoint.runServiceId = utils.last(serviceName.split("/"));
        }
    }
    proto.renameIfPresent(endpoint, gcfFunction, "uri", "url");
    endpoint.codebase = ((_e = gcfFunction.labels) === null || _e === void 0 ? void 0 : _e[constants_1.CODEBASE_LABEL]) || projectConfig.DEFAULT_CODEBASE;
    if ((_f = gcfFunction.labels) === null || _f === void 0 ? void 0 : _f[constants_1.HASH_LABEL]) {
        endpoint.hash = gcfFunction.labels[constants_1.HASH_LABEL];
    }
    proto.copyIfPresent(endpoint, gcfFunction, "state");
    return endpoint;
}
exports.endpointFromFunction = endpointFromFunction;
