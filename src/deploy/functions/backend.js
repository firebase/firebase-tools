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
exports.compareFunctions = exports.missingEndpoint = exports.hasEndpoint = exports.regionalEndpoints = exports.matchingBackend = exports.findEndpoint = exports.someEndpoint = exports.allEndpoints = exports.checkAvailability = exports.existingBackend = exports.scheduleIdForFunction = exports.functionName = exports.isEmptyBackend = exports.merge = exports.of = exports.empty = exports.isBlockingTriggered = exports.isTaskQueueTriggered = exports.isScheduleTriggered = exports.isEventTriggered = exports.isCallableTriggered = exports.isHttpsTriggered = exports.AllFunctionsPlatforms = exports.secretVersionName = exports.SCHEDULED_FUNCTION_LABEL = exports.MIN_CPU_FOR_CONCURRENCY = exports.DEFAULT_MEMORY = exports.DEFAULT_CONCURRENCY = exports.memoryToGen2Cpu = exports.memoryToGen1Cpu = exports.memoryOptionDisplayName = exports.isValidEgressSetting = exports.isValidMemoryOption = exports.AllIngressSettings = exports.AllVpcEgressSettings = exports.endpointTriggerType = void 0;
const gcf = __importStar(require("../../gcp/cloudfunctions"));
const gcfV2 = __importStar(require("../../gcp/cloudfunctionsv2"));
const utils = __importStar(require("../../utils"));
const error_1 = require("../../error");
const functional_1 = require("../../functional");
/** A user-friendly string for the kind of trigger of an endpoint. */
function endpointTriggerType(endpoint) {
    if (isScheduleTriggered(endpoint)) {
        return "scheduled";
    }
    else if (isHttpsTriggered(endpoint)) {
        return "https";
    }
    else if (isCallableTriggered(endpoint)) {
        return "callable";
    }
    else if (isEventTriggered(endpoint)) {
        return endpoint.eventTrigger.eventType;
    }
    else if (isTaskQueueTriggered(endpoint)) {
        return "taskQueue";
    }
    else if (isBlockingTriggered(endpoint)) {
        return endpoint.blockingTrigger.eventType;
    }
    (0, functional_1.assertExhaustive)(endpoint);
}
exports.endpointTriggerType = endpointTriggerType;
exports.AllVpcEgressSettings = ["PRIVATE_RANGES_ONLY", "ALL_TRAFFIC"];
exports.AllIngressSettings = [
    "ALLOW_ALL",
    "ALLOW_INTERNAL_ONLY",
    "ALLOW_INTERNAL_AND_GCLB",
];
const allMemoryOptions = [128, 256, 512, 1024, 2048, 4096, 8192, 16384, 32768];
/**
 * Is a given number a valid MemoryOption?
 */
function isValidMemoryOption(mem) {
    return allMemoryOptions.includes(mem);
}
exports.isValidMemoryOption = isValidMemoryOption;
/**
 * Is a given string a valid VpcEgressSettings?
 */
function isValidEgressSetting(egress) {
    return egress === "PRIVATE_RANGES_ONLY" || egress === "ALL_TRAFFIC";
}
exports.isValidEgressSetting = isValidEgressSetting;
/** Returns a human-readable name with MB or GB suffix for a MemoryOption (MB). */
function memoryOptionDisplayName(option) {
    return {
        128: "128MB",
        256: "256MB",
        512: "512MB",
        1024: "1GB",
        2048: "2GB",
        4096: "4GB",
        8192: "8GB",
        16384: "16GB",
        32768: "32GB",
    }[option];
}
exports.memoryOptionDisplayName = memoryOptionDisplayName;
/**
 * Returns the gen 1 mapping of CPU for RAM. Used whenever a customer sets cpu to "gcf_gen1".
 * Note that these values must be the right number of decimal places and include
 * rounding errors (e.g. 0.1666 instead of 0.1667) so that we match GCF's
 * behavior and don't unnecessarily create a new Run revision because our target
 * CPU doesn't exactly match their CPU.
 */
function memoryToGen1Cpu(memory) {
    return {
        128: 0.0833,
        256: 0.1666,
        512: 0.3333,
        1024: 0.5833,
        2048: 1,
        4096: 2,
        8192: 2,
        16384: 4,
        32768: 8,
    }[memory];
}
exports.memoryToGen1Cpu = memoryToGen1Cpu;
/**
 * The amount of CPU we allocate in V2.
 * Where these don't match with memoryToGen1Cpu we must manually configure these
 * at the run service.
 */
function memoryToGen2Cpu(memory) {
    return {
        128: 1,
        256: 1,
        512: 1,
        1024: 1,
        2048: 1,
        4096: 2,
        8192: 2,
        16384: 4,
        32768: 8,
    }[memory];
}
exports.memoryToGen2Cpu = memoryToGen2Cpu;
exports.DEFAULT_CONCURRENCY = 80;
exports.DEFAULT_MEMORY = 256;
exports.MIN_CPU_FOR_CONCURRENCY = 1;
exports.SCHEDULED_FUNCTION_LABEL = Object.freeze({ deployment: "firebase-schedule" });
/**
 * Returns full resource name of a secret version.
 */
function secretVersionName(s) {
    return `projects/${s.projectId}/secrets/${s.secret}/versions/${s.version ?? "latest"}`;
}
exports.secretVersionName = secretVersionName;
exports.AllFunctionsPlatforms = ["gcfv1", "gcfv2", "run"];
/** Whether something has an HttpsTrigger */
function isHttpsTriggered(triggered) {
    return {}.hasOwnProperty.call(triggered, "httpsTrigger");
}
exports.isHttpsTriggered = isHttpsTriggered;
/** Whether something has a CallableTrigger */
function isCallableTriggered(triggered) {
    return {}.hasOwnProperty.call(triggered, "callableTrigger");
}
exports.isCallableTriggered = isCallableTriggered;
/** Whether something has an EventTrigger */
function isEventTriggered(triggered) {
    return {}.hasOwnProperty.call(triggered, "eventTrigger");
}
exports.isEventTriggered = isEventTriggered;
/** Whether something has a ScheduleTrigger */
function isScheduleTriggered(triggered) {
    return {}.hasOwnProperty.call(triggered, "scheduleTrigger");
}
exports.isScheduleTriggered = isScheduleTriggered;
/** Whether something has a TaskQueueTrigger */
function isTaskQueueTriggered(triggered) {
    return {}.hasOwnProperty.call(triggered, "taskQueueTrigger");
}
exports.isTaskQueueTriggered = isTaskQueueTriggered;
/** Whether something has a BlockingTrigger */
function isBlockingTriggered(triggered) {
    return {}.hasOwnProperty.call(triggered, "blockingTrigger");
}
exports.isBlockingTriggered = isBlockingTriggered;
/**
 * A helper utility to create an empty backend.
 * Tests that verify the behavior of one possible resource in a Backend can use
 * this method to avoid compiler errors when new fields are added to Backend.
 */
function empty() {
    return {
        requiredAPIs: [],
        endpoints: {},
        environmentVariables: {},
    };
}
exports.empty = empty;
/**
 * A helper utility to create a backend from a list of endpoints.
 * Useful in unit tests.
 */
function of(...endpoints) {
    const bkend = { ...empty() };
    for (const endpoint of endpoints) {
        bkend.endpoints[endpoint.region] = bkend.endpoints[endpoint.region] || {};
        if (bkend.endpoints[endpoint.region][endpoint.id]) {
            throw new Error("Trying to create a backend with the same endpoint twice");
        }
        bkend.endpoints[endpoint.region][endpoint.id] = endpoint;
    }
    return bkend;
}
exports.of = of;
/**
 * A helper utility to merge backends.
 */
function merge(...backends) {
    // Merge all endpoints
    const merged = of(...(0, functional_1.flattenArray)(backends.map((b) => allEndpoints(b))));
    // Merge all APIs
    const apiToReasons = {};
    for (const b of backends) {
        for (const { api, reason } of b.requiredAPIs) {
            const reasons = apiToReasons[api] || new Set();
            if (reason) {
                reasons.add(reason);
            }
            apiToReasons[api] = reasons;
        }
        // Mere all environment variables.
        merged.environmentVariables = { ...merged.environmentVariables, ...b.environmentVariables };
    }
    for (const [api, reasons] of Object.entries(apiToReasons)) {
        merged.requiredAPIs.push({ api, reason: Array.from(reasons).join(" ") });
    }
    return merged;
}
exports.merge = merge;
/**
 * A helper utility to test whether a backend is empty.
 * Consumers should use this before assuming a backend is empty (e.g. nooping
 * deploy processes) because it's possible that fields have been added.
 */
function isEmptyBackend(backend) {
    return (Object.keys(backend.requiredAPIs).length === 0 && Object.keys(backend.endpoints).length === 0);
}
exports.isEmptyBackend = isEmptyBackend;
/**
 * Gets the formal resource name for a Cloud Function.
 */
function functionName(cloudFunction) {
    return `projects/${cloudFunction.project}/locations/${cloudFunction.region}/functions/${cloudFunction.id}`;
}
exports.functionName = functionName;
/**
 * The naming pattern used to create a Pub/Sub Topic or Scheduler Job ID for a given scheduled function.
 * This pattern is hard-coded and assumed throughout tooling, both in the Firebase Console and in the CLI.
 * For e.g., we automatically assume a schedule and topic with this name exists when we list functions and
 * see a label that it has an attached schedule. This saves us from making extra API calls.
 * DANGER: We use the pattern defined here to deploy and delete schedules,
 * and to display scheduled functions in the Firebase console
 * If you change this pattern, Firebase console will stop displaying schedule descriptions
 * and schedules created under the old pattern will no longer be cleaned up correctly
 */
function scheduleIdForFunction(cloudFunction) {
    return `firebase-schedule-${cloudFunction.id}-${cloudFunction.region}`;
}
exports.scheduleIdForFunction = scheduleIdForFunction;
/**
 * A caching accessor of the existing backend.
 * The method explicitly loads Cloud Functions from their API but implicitly deduces
 * functions' schedules and topics based on function labels. Functions that are not
 * deployed with the Firebase CLI are included so that we can support customers moving
 * a function that was managed with GCloud to managed by Firebase as an update operation.
 * To determine whether a function was already managed by firebase-tools use
 * deploymentTool.isFirebaseManaged(function.labels)
 * @param context A context object, passed from the Command library and used for caching.
 * @param forceRefresh If true, ignores and overwrites the cache. These cases should eventually go away.
 * @return The backend
 */
async function existingBackend(context, forceRefresh) {
    if (!context.loadedExistingBackend || forceRefresh) {
        await loadExistingBackend(context);
    }
    // loadExisting guarantees the validity of existingBackend and unreachableRegions
    return context.existingBackend;
}
exports.existingBackend = existingBackend;
async function loadExistingBackend(ctx) {
    ctx.loadedExistingBackend = true;
    // Note: is it worth deducing the APIs that must have been enabled for this backend to work?
    // it could reduce redundant API calls for enabling the APIs.
    ctx.existingBackend = {
        ...empty(),
    };
    ctx.unreachableRegions = {
        gcfV1: [],
        gcfV2: [],
        run: [],
    };
    const gcfV1Results = await gcf.listAllFunctions(ctx.projectId);
    for (const apiFunction of gcfV1Results.functions) {
        const endpoint = gcf.endpointFromFunction(apiFunction);
        ctx.existingBackend.endpoints[endpoint.region] =
            ctx.existingBackend.endpoints[endpoint.region] || {};
        ctx.existingBackend.endpoints[endpoint.region][endpoint.id] = endpoint;
    }
    ctx.unreachableRegions.gcfV1 = gcfV1Results.unreachable;
    let gcfV2Results;
    try {
        gcfV2Results = await gcfV2.listAllFunctions(ctx.projectId);
        for (const apiFunction of gcfV2Results.functions) {
            const endpoint = gcfV2.endpointFromFunction(apiFunction);
            ctx.existingBackend.endpoints[endpoint.region] =
                ctx.existingBackend.endpoints[endpoint.region] || {};
            ctx.existingBackend.endpoints[endpoint.region][endpoint.id] = endpoint;
        }
        ctx.unreachableRegions.gcfV2 = gcfV2Results.unreachable;
    }
    catch (err) {
        if (err.status === 404 && err.message?.toLowerCase().includes("method not found")) {
            return; // customer has preview enabled without allowlist set
        }
        throw err;
    }
}
/**
 * A helper function that guards against unavailable regions affecting a backend deployment.
 * If the desired backend uses a region that is unavailable, a FirebaseError is thrown.
 * If a region is unavailable but the desired backend does not use it, a warning is logged
 * that the standard cleanup process won't happen in that region.
 * @param context A context object from the Command library. Used for caching.
 * @param want The desired backend. Can be backend.empty() to only warn about unavailability.
 */
async function checkAvailability(context, want) {
    if (!context.loadedExistingBackend) {
        await loadExistingBackend(context);
    }
    const gcfV1Regions = new Set();
    const gcfV2Regions = new Set();
    for (const ep of allEndpoints(want)) {
        if (ep.platform === "gcfv1") {
            gcfV1Regions.add(ep.region);
        }
        else {
            gcfV2Regions.add(ep.region);
        }
    }
    const neededUnreachableV1 = context.unreachableRegions?.gcfV1.filter((region) => gcfV1Regions.has(region));
    const neededUnreachableV2 = context.unreachableRegions?.gcfV2.filter((region) => gcfV2Regions.has(region));
    if (neededUnreachableV1?.length) {
        throw new error_1.FirebaseError("The following Cloud Functions regions are currently unreachable:\n\t" +
            neededUnreachableV1.join("\n\t") +
            "\nThis deployment contains functions in those regions. Please try again in a few minutes, or exclude these regions from your deployment.");
    }
    if (neededUnreachableV2?.length) {
        throw new error_1.FirebaseError("The following Cloud Functions V2 regions are currently unreachable:\n\t" +
            neededUnreachableV2.join("\n\t") +
            "\nThis deployment contains functions in those regions. Please try again in a few minutes, or exclude these regions from your deployment.");
    }
    if (context.unreachableRegions?.gcfV1.length) {
        utils.logLabeledWarning("functions", "The following Cloud Functions regions are currently unreachable:\n" +
            context.unreachableRegions.gcfV1.join("\n") +
            "\nCloud Functions in these regions won't be deleted.");
    }
    if (context.unreachableRegions?.gcfV2.length) {
        utils.logLabeledWarning("functions", "The following Cloud Functions V2 regions are currently unreachable:\n" +
            context.unreachableRegions.gcfV2.join("\n") +
            "\nCloud Functions in these regions won't be deleted.");
    }
    if (context.unreachableRegions?.run.length) {
        utils.logLabeledWarning("functions", "The following Cloud Run regions are currently unreachable:\n" +
            context.unreachableRegions.run.join("\n") +
            "\nCloud Run services in these regions won't be deleted.");
    }
}
exports.checkAvailability = checkAvailability;
/** A helper utility for flattening all endpoints in a backend since typing is a bit wonky. */
function allEndpoints(backend) {
    return Object.values(backend.endpoints).reduce((accum, perRegion) => {
        return [...accum, ...Object.values(perRegion)];
    }, []);
}
exports.allEndpoints = allEndpoints;
/** A helper utility for checking whether an endpoint matches a predicate. */
function someEndpoint(backend, predicate) {
    for (const endpoints of Object.values(backend.endpoints)) {
        if (Object.values(endpoints).some(predicate)) {
            return true;
        }
    }
    return false;
}
exports.someEndpoint = someEndpoint;
/** A helper utility for finding an endpoint that matches the predicate. */
function findEndpoint(backend, predicate) {
    for (const endpoints of Object.values(backend.endpoints)) {
        const endpoint = Object.values(endpoints).find(predicate);
        if (endpoint)
            return endpoint;
    }
}
exports.findEndpoint = findEndpoint;
/** A helper utility function that returns a subset of the backend that includes only matching endpoints */
function matchingBackend(backend, predicate) {
    const filtered = {
        ...backend,
        endpoints: {},
    };
    for (const endpoint of allEndpoints(backend)) {
        if (!predicate(endpoint)) {
            continue;
        }
        filtered.endpoints[endpoint.region] = filtered.endpoints[endpoint.region] || {};
        filtered.endpoints[endpoint.region][endpoint.id] = endpoint;
    }
    return filtered;
}
exports.matchingBackend = matchingBackend;
/** A helper utility for flattening all endpoints in a region since typing is a bit wonky. */
function regionalEndpoints(backend, region) {
    return backend.endpoints[region] ? Object.values(backend.endpoints[region]) : [];
}
exports.regionalEndpoints = regionalEndpoints;
/** A curried function used for filters, returns a matcher for functions in a backend. */
const hasEndpoint = (backend) => (endpoint) => {
    return (!!backend.endpoints[endpoint.region] && !!backend.endpoints[endpoint.region][endpoint.id]);
};
exports.hasEndpoint = hasEndpoint;
/** A curried function that is the opposite of hasEndpoint */
const missingEndpoint = (backend) => (endpoint) => {
    return !(0, exports.hasEndpoint)(backend)(endpoint);
};
exports.missingEndpoint = missingEndpoint;
/**
 * A standard method for sorting endpoints for display.
 * Future versions might consider sorting region by pricing tier before
 * alphabetically
 */
function compareFunctions(left, right) {
    if (left.platform !== right.platform) {
        return right.platform < left.platform ? -1 : 1;
    }
    if (left.region < right.region) {
        return -1;
    }
    if (left.region > right.region) {
        return 1;
    }
    if (left.id < right.id) {
        return -1;
    }
    if (left.id > right.id) {
        return 1;
    }
    return 0;
}
exports.compareFunctions = compareFunctions;
//# sourceMappingURL=backend.js.map