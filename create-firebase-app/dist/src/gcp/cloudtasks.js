"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.triggerFromQueue = exports.queueFromEndpoint = exports.queueNameForEndpoint = exports.setEnqueuer = exports.getIamPolicy = exports.setIamPolicy = exports.deleteQueue = exports.purgeQueue = exports.upsertQueue = exports.updateQueue = exports.getQueue = exports.createQueue = exports.DEFAULT_SETTINGS = void 0;
const proto = require("./proto");
const apiv2_1 = require("../apiv2");
const api_1 = require("../api");
const functional_1 = require("../functional");
const API_VERSION = "v2";
const client = new apiv2_1.Client({
    urlPrefix: (0, api_1.cloudTasksOrigin)(),
    auth: true,
    apiVersion: API_VERSION,
});
/**
 * The client-side defaults we set for a queue.
 * Unlike most APIs, Cloud Tasks doesn't omit fields which
 * have default values. This means when we create a queue without
 * maxDoublings, for example, it will be returned as a queue with
 * maxDoublings set to 16. By setting our in-memory queue to the
 * server-side defaults we'll be able to more accurately see whether
 * our in-memory representation matches the current state on upsert
 * and avoid a PUT call.
 * NOTE: we explicitly _don't_ have the same default for
 * retryConfig.maxAttempts. The server-side default is effectively
 * infinite, which can cause customers to have runaway bills if the
 * function crashes. We settled on a Firebase default of 3 since
 * infrastructure errors also count against this limit and 1-(1-99.9%)^3
 * means we'll have 9-9s reliability of invoking the customer's
 * function at least once (though unfortuantely this math assumes
 * failures are independent events, which is generally untrue).
 */
exports.DEFAULT_SETTINGS = {
    rateLimits: {
        maxConcurrentDispatches: 1000,
        maxDispatchesPerSecond: 500,
    },
    state: "RUNNING",
    retryConfig: {
        maxDoublings: 16,
        maxAttempts: 3,
        maxBackoff: "3600s",
        minBackoff: "0.100s",
    },
};
/** Create a Queue that matches the spec. */
async function createQueue(queue) {
    const path = queue.name.substring(0, queue.name.lastIndexOf("/"));
    const res = await client.post(path, queue);
    return res.body;
}
exports.createQueue = createQueue;
/** Get the Queue for a given name. */
async function getQueue(name) {
    const res = await client.get(name);
    return res.body;
}
exports.getQueue = getQueue;
/** Updates a queue to match the passed parameter. */
async function updateQueue(queue) {
    const res = await client.patch(queue.name, queue, {
        queryParams: { updateMask: proto.fieldMasks(queue).join(",") },
    });
    return res.body;
}
exports.updateQueue = updateQueue;
/** Ensures a queue exists with the given spec. Returns true if created and false if updated/left alone. */
async function upsertQueue(queue) {
    var _a, _b;
    try {
        // Here and throughout we use module.exports to ensure late binding & enable stubs in unit tests.
        const existing = await module.exports.getQueue(queue.name);
        if (JSON.stringify(queue) === JSON.stringify(existing)) {
            return false;
        }
        if (existing.state === "DISABLED") {
            await module.exports.purgeQueue(queue.name);
        }
        await module.exports.updateQueue(queue);
        return false;
    }
    catch (err) {
        if (((_b = (_a = err === null || err === void 0 ? void 0 : err.context) === null || _a === void 0 ? void 0 : _a.response) === null || _b === void 0 ? void 0 : _b.statusCode) === 404) {
            await module.exports.createQueue(queue);
            return true;
        }
        throw err;
    }
}
exports.upsertQueue = upsertQueue;
/** Purges all messages in a queue with a given name. */
async function purgeQueue(name) {
    await client.post(`${name}:purge`);
}
exports.purgeQueue = purgeQueue;
/** Deletes a queue with a given name. */
async function deleteQueue(name) {
    await client.delete(name);
}
exports.deleteQueue = deleteQueue;
/** Set the IAM policy of a given queue. */
async function setIamPolicy(name, policy) {
    const res = await client.post(`${name}:setIamPolicy`, {
        policy,
    });
    return res.body;
}
exports.setIamPolicy = setIamPolicy;
/** Returns the IAM policy of a given queue. */
async function getIamPolicy(name) {
    const res = await client.post(`${name}:getIamPolicy`);
    return res.body;
}
exports.getIamPolicy = getIamPolicy;
const ENQUEUER_ROLE = "roles/cloudtasks.enqueuer";
/** Ensures that the invoker policy is set for a given queue. */
async function setEnqueuer(name, invoker, assumeEmpty = false) {
    var _a, _b;
    let existing;
    if (assumeEmpty) {
        existing = {
            bindings: [],
            etag: "",
            version: 3,
        };
    }
    else {
        existing = await module.exports.getIamPolicy(name);
    }
    const [, project] = name.split("/");
    const invokerMembers = proto.getInvokerMembers(invoker, project);
    while (true) {
        const policy = {
            bindings: existing.bindings.filter((binding) => binding.role !== ENQUEUER_ROLE),
            etag: existing.etag,
            version: existing.version,
        };
        if (invokerMembers.length) {
            policy.bindings.push({ role: ENQUEUER_ROLE, members: invokerMembers });
        }
        if (JSON.stringify(policy) === JSON.stringify(existing)) {
            return;
        }
        try {
            await module.exports.setIamPolicy(name, policy);
            return;
        }
        catch (err) {
            // Re-fetch on conflict
            if (((_b = (_a = err === null || err === void 0 ? void 0 : err.context) === null || _a === void 0 ? void 0 : _a.response) === null || _b === void 0 ? void 0 : _b.statusCode) === 429) {
                existing = await module.exports.getIamPolicy(name);
                continue;
            }
            throw err;
        }
    }
}
exports.setEnqueuer = setEnqueuer;
/** The name of the Task Queue we will use for this endpoint. */
function queueNameForEndpoint(endpoint) {
    return `projects/${endpoint.project}/locations/${endpoint.region}/queues/${endpoint.id}`;
}
exports.queueNameForEndpoint = queueNameForEndpoint;
/** Creates an API type from an Endpoint type */
function queueFromEndpoint(endpoint) {
    const queue = Object.assign(Object.assign({}, JSON.parse(JSON.stringify(exports.DEFAULT_SETTINGS))), { name: queueNameForEndpoint(endpoint) });
    if (endpoint.taskQueueTrigger.rateLimits) {
        proto.copyIfPresent(queue.rateLimits, endpoint.taskQueueTrigger.rateLimits, "maxConcurrentDispatches", "maxDispatchesPerSecond");
    }
    if (endpoint.taskQueueTrigger.retryConfig) {
        proto.copyIfPresent(queue.retryConfig, endpoint.taskQueueTrigger.retryConfig, "maxAttempts", "maxDoublings");
        proto.convertIfPresent(queue.retryConfig, endpoint.taskQueueTrigger.retryConfig, "maxRetryDuration", "maxRetrySeconds", (0, functional_1.nullsafeVisitor)(proto.durationFromSeconds));
        proto.convertIfPresent(queue.retryConfig, endpoint.taskQueueTrigger.retryConfig, "maxBackoff", "maxBackoffSeconds", (0, functional_1.nullsafeVisitor)(proto.durationFromSeconds));
        proto.convertIfPresent(queue.retryConfig, endpoint.taskQueueTrigger.retryConfig, "minBackoff", "minBackoffSeconds", (0, functional_1.nullsafeVisitor)(proto.durationFromSeconds));
    }
    return queue;
}
exports.queueFromEndpoint = queueFromEndpoint;
/** Creates a trigger type from API type */
function triggerFromQueue(queue) {
    const taskQueueTrigger = {};
    if (queue.rateLimits) {
        taskQueueTrigger.rateLimits = {};
        proto.copyIfPresent(taskQueueTrigger.rateLimits, queue.rateLimits, "maxConcurrentDispatches", "maxDispatchesPerSecond");
    }
    if (queue.retryConfig) {
        taskQueueTrigger.retryConfig = {};
        proto.copyIfPresent(taskQueueTrigger.retryConfig, queue.retryConfig, "maxAttempts", "maxDoublings");
        proto.convertIfPresent(taskQueueTrigger.retryConfig, queue.retryConfig, "maxRetrySeconds", "maxRetryDuration", (0, functional_1.nullsafeVisitor)(proto.secondsFromDuration));
        proto.convertIfPresent(taskQueueTrigger.retryConfig, queue.retryConfig, "maxBackoffSeconds", "maxBackoff", (0, functional_1.nullsafeVisitor)(proto.secondsFromDuration));
        proto.convertIfPresent(taskQueueTrigger.retryConfig, queue.retryConfig, "minBackoffSeconds", "minBackoff", (0, functional_1.nullsafeVisitor)(proto.secondsFromDuration));
    }
    return taskQueueTrigger;
}
exports.triggerFromQueue = triggerFromQueue;
