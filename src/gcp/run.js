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
exports.fetchServiceLogs = exports.setInvokerUpdate = exports.setInvokerCreate = exports.getIamPolicy = exports.setIamPolicy = exports.replaceService = exports.serviceIsResolved = exports.updateService = exports.getService = exports.gcpIds = exports.LOCATION_LABEL = void 0;
const apiv2_1 = require("../apiv2");
const error_1 = require("../error");
const api_1 = require("../api");
const proto = __importStar(require("./proto"));
const throttler_1 = require("../throttler/throttler");
const logger_1 = require("../logger");
const cloudlogging_1 = require("./cloudlogging");
const API_VERSION = "v1";
const client = new apiv2_1.Client({
    urlPrefix: (0, api_1.runOrigin)(),
    auth: true,
    apiVersion: API_VERSION,
});
exports.LOCATION_LABEL = "cloud.googleapis.com/location";
/**
 * Gets the standard project/location/id tuple from the K8S style resource.
 */
function gcpIds(service) {
    return {
        serviceId: service.metadata.name,
        projectNumber: service.metadata.namespace,
        region: service.metadata.labels?.[exports.LOCATION_LABEL] || "unknown-region",
    };
}
exports.gcpIds = gcpIds;
/**
 * Gets a service with a given name.
 */
async function getService(name) {
    try {
        const response = await client.get(name);
        return response.body;
    }
    catch (err) {
        throw new error_1.FirebaseError(`Failed to fetch Run service ${name}`, {
            original: err,
            status: err?.context?.response?.statusCode,
        });
    }
}
exports.getService = getService;
/**
 * Update a service and wait for changes to replicate.
 */
async function updateService(name, service) {
    delete service.status;
    service = await exports.replaceService(name, service);
    // Now we need to wait for reconciliation or we might delete the docker
    // image while the service is still rolling out a new revision.
    let retry = 0;
    while (!exports.serviceIsResolved(service)) {
        await (0, throttler_1.backoff)(retry, 2, 30);
        retry = retry + 1;
        service = await exports.getService(name);
    }
    return service;
}
exports.updateService = updateService;
/**
 * Returns whether a service is resolved (all transitions have completed).
 */
function serviceIsResolved(service) {
    if (service.status?.observedGeneration !== service.metadata.generation) {
        logger_1.logger.debug(`Service ${service.metadata.name} is not resolved because` +
            `observed generation ${service.status?.observedGeneration} does not ` +
            `match spec generation ${service.metadata.generation}`);
        return false;
    }
    const readyCondition = service.status?.conditions?.find((condition) => {
        return condition.type === "Ready";
    });
    if (readyCondition?.status === "Unknown") {
        logger_1.logger.debug(`Waiting for service ${service.metadata.name} to be ready. ` +
            `Status is ${JSON.stringify(service.status?.conditions)}`);
        return false;
    }
    else if (readyCondition?.status === "True") {
        return true;
    }
    logger_1.logger.debug(`Service ${service.metadata.name} has unexpected ready status ${JSON.stringify(readyCondition)}. It may have failed rollout.`);
    throw new error_1.FirebaseError(`Unexpected Status ${readyCondition?.status} for service ${service.metadata.name}`);
}
exports.serviceIsResolved = serviceIsResolved;
/**
 * Replaces a service spec. Prefer updateService to block on replication.
 */
async function replaceService(name, service) {
    try {
        const response = await client.put(name, service);
        return response.body;
    }
    catch (err) {
        throw new error_1.FirebaseError(`Failed to replace Run service ${name}`, {
            original: err,
            status: err?.context?.response?.statusCode,
        });
    }
}
exports.replaceService = replaceService;
/**
 * Sets the IAM policy of a Service
 * @param name Fully qualified name of the Service.
 * @param policy The [policy](https://cloud.google.com/run/docs/reference/rest/v1/projects.locations.services/setIamPolicy) to set.
 */
async function setIamPolicy(name, policy, httpClient = client) {
    try {
        await httpClient.post(`${name}:setIamPolicy`, {
            policy,
            updateMask: proto.fieldMasks(policy).join(","),
        });
    }
    catch (err) {
        throw new error_1.FirebaseError(`Failed to set the IAM Policy on the Service ${name}`, {
            original: err,
            status: err?.context?.response?.statusCode,
        });
    }
}
exports.setIamPolicy = setIamPolicy;
/**
 * Gets IAM policy for a service.
 */
async function getIamPolicy(serviceName, httpClient = client) {
    try {
        const response = await httpClient.get(`${serviceName}:getIamPolicy`);
        return response.body;
    }
    catch (err) {
        throw new error_1.FirebaseError(`Failed to get the IAM Policy on the Service ${serviceName}`, {
            original: err,
        });
    }
}
exports.getIamPolicy = getIamPolicy;
/**
 * Gets the current IAM policy for the run service and overrides the invoker role with the supplied invoker members
 * @param projectId id of the project
 * @param serviceName cloud run service
 * @param invoker an array of invoker strings
 * @throws {@link FirebaseError} on an empty invoker, when the IAM Polciy fails to be grabbed or set
 */
async function setInvokerCreate(projectId, serviceName, invoker, httpClient = client) {
    if (invoker.length === 0) {
        throw new error_1.FirebaseError("Invoker cannot be an empty array");
    }
    const invokerMembers = proto.getInvokerMembers(invoker, projectId);
    const invokerRole = "roles/run.invoker";
    const bindings = [{ role: invokerRole, members: invokerMembers }];
    const policy = {
        bindings: bindings,
        etag: "",
        version: 3,
    };
    await setIamPolicy(serviceName, policy, httpClient);
}
exports.setInvokerCreate = setInvokerCreate;
/**
 * Gets the current IAM policy for the run service and overrides the invoker role with the supplied invoker members
 * @param projectId id of the project
 * @param serviceName cloud run service
 * @param invoker an array of invoker strings
 * @throws {@link FirebaseError} on an empty invoker, when the IAM Polciy fails to be grabbed or set
 */
async function setInvokerUpdate(projectId, serviceName, invoker, httpClient = client) {
    if (invoker.length === 0) {
        throw new error_1.FirebaseError("Invoker cannot be an empty array");
    }
    const invokerMembers = proto.getInvokerMembers(invoker, projectId);
    const invokerRole = "roles/run.invoker";
    const currentPolicy = await getIamPolicy(serviceName, httpClient);
    const currentInvokerBinding = currentPolicy.bindings?.find((binding) => binding.role === invokerRole);
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
    await setIamPolicy(serviceName, policy, httpClient);
}
exports.setInvokerUpdate = setInvokerUpdate;
/**
 * Fetches recent logs for a given Cloud Run service using the Cloud Logging API.
 * @param projectId The Google Cloud project ID.
 * @param serviceId The resource name of the Cloud Run service.
 * @return A promise that resolves with the log entries.
 */
async function fetchServiceLogs(projectId, serviceId) {
    const filter = `resource.type="cloud_run_revision" AND resource.labels.service_name="${serviceId}"`;
    const pageSize = 100;
    const order = "desc";
    try {
        const entries = await (0, cloudlogging_1.listEntries)(projectId, filter, pageSize, order);
        return entries || [];
    }
    catch (err) {
        throw new error_1.FirebaseError(`Failed to fetch logs for Cloud Run service ${serviceId}`, {
            original: err,
            status: err?.context?.response?.statusCode,
        });
    }
}
exports.fetchServiceLogs = fetchServiceLogs;
//# sourceMappingURL=run.js.map