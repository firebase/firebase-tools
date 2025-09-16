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
exports.applyPrefix = exports.toBackend = exports.envWithTypes = exports.resolveBackend = exports.AllIngressSettings = exports.AllVpcEgressSettings = exports.AllFunctionsPlatforms = exports.isBlockingTriggered = exports.isTaskQueueTriggered = exports.isScheduleTriggered = exports.isEventTriggered = exports.isCallableTriggered = exports.isHttpsTriggered = exports.of = exports.empty = void 0;
const backend = __importStar(require("./backend"));
const proto = __importStar(require("../../gcp/proto"));
const api = __importStar(require("../../api"));
const params = __importStar(require("./params"));
const error_1 = require("../../error");
const functional_1 = require("../../functional");
const cel_1 = require("./cel");
/**
 *  A utility function that returns an empty Build.
 */
function empty() {
    return {
        requiredAPIs: [],
        endpoints: {},
        params: [],
    };
}
exports.empty = empty;
/**
 * A utility function that creates a Build containing a map of IDs to Endpoints
 */
function of(endpoints) {
    const build = empty();
    build.endpoints = endpoints;
    return build;
}
exports.of = of;
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
const allMemoryOptions = [128, 256, 512, 1024, 2048, 4096, 8192, 16384, 32768];
exports.AllFunctionsPlatforms = ["gcfv1", "gcfv2"];
exports.AllVpcEgressSettings = ["PRIVATE_RANGES_ONLY", "ALL_TRAFFIC"];
exports.AllIngressSettings = [
    "ALLOW_ALL",
    "ALLOW_INTERNAL_ONLY",
    "ALLOW_INTERNAL_AND_GCLB",
];
/**
 * Resolves user-defined parameters inside a Build and generates a Backend.
 * Callers are responsible for persisting resolved env vars.
 */
async function resolveBackend(opts) {
    const paramValues = await params.resolveParams(opts.build.params, opts.firebaseConfig, envWithTypes(opts.build.params, opts.userEnvs), opts.nonInteractive, opts.isEmulator);
    return { backend: toBackend(opts.build, paramValues), envs: paramValues };
}
exports.resolveBackend = resolveBackend;
// Exported for testing
/**
 *
 */
function envWithTypes(definedParams, rawEnvs) {
    const out = {};
    for (const envName of Object.keys(rawEnvs)) {
        const value = rawEnvs[envName];
        let providedType = {
            string: true,
            boolean: true,
            number: true,
            list: true,
        };
        for (const param of definedParams) {
            if (param.name === envName) {
                if (param.type === "string") {
                    providedType = {
                        string: true,
                        boolean: false,
                        number: false,
                        list: false,
                    };
                }
                else if (param.type === "int") {
                    providedType = {
                        string: false,
                        boolean: false,
                        number: true,
                        list: false,
                    };
                }
                else if (param.type === "boolean") {
                    providedType = {
                        string: false,
                        boolean: true,
                        number: false,
                        list: false,
                    };
                }
                else if (param.type === "list") {
                    providedType = {
                        string: false,
                        boolean: false,
                        number: false,
                        list: true,
                    };
                }
                else if (param.type === "secret") {
                    // NOTE(danielylee): Secret values are not supposed to be
                    // provided in the env files. However, users may do it anyway.
                    // Secret values will be provided as strings in those cases.
                    providedType = {
                        string: true,
                        boolean: false,
                        number: false,
                        list: false,
                    };
                }
            }
        }
        out[envName] = new params.ParamValue(value, false, providedType);
    }
    return out;
}
exports.envWithTypes = envWithTypes;
// Utility class to make it more fluent to use proto.convertIfPresent
// The class usese const lambdas so it doesn't loose the this context when
// passing Resolver.resolveFoo as a proto.convertIfPresent arg.
// The class also recognizes that if the input is not null the output cannot be
// null.
class Resolver {
    constructor(paramValues) {
        this.paramValues = paramValues;
        // NB: The (Extract<T, null> | number) says "If T can be null, the return value"
        // can be null. If we know input is not null, the return type is known to not
        // be null.
        this.resolveInt = (i) => {
            if (i === null) {
                return i;
            }
            return params.resolveInt(i, this.paramValues);
        };
        this.resolveBoolean = (i) => {
            if (i === null) {
                return i;
            }
            return params.resolveBoolean(i, this.paramValues);
        };
        this.resolveString = (i) => {
            if (i === null) {
                return i;
            }
            return params.resolveString(i, this.paramValues);
        };
    }
    resolveStrings(dest, src, ...keys) {
        for (const key of keys) {
            const orig = src[key];
            if (typeof orig === "undefined") {
                continue;
            }
            dest[key] = orig === null ? null : params.resolveString(orig, this.paramValues);
        }
    }
    resolveInts(dest, src, ...keys) {
        for (const key of keys) {
            const orig = src[key];
            if (typeof orig === "undefined") {
                continue;
            }
            dest[key] = orig === null ? null : params.resolveInt(orig, this.paramValues);
        }
    }
}
/** Converts a build specification into a Backend representation, with all Params resolved and interpolated */
function toBackend(build, paramValues) {
    const r = new Resolver(paramValues);
    const bkEndpoints = [];
    for (const endpointId of Object.keys(build.endpoints)) {
        const bdEndpoint = build.endpoints[endpointId];
        if (r.resolveBoolean(bdEndpoint.omit || false)) {
            continue;
        }
        let regions = [];
        if (!bdEndpoint.region) {
            regions = [api.functionsDefaultRegion()];
        }
        else if (Array.isArray(bdEndpoint.region)) {
            regions = params.resolveList(bdEndpoint.region, paramValues);
        }
        else {
            // N.B. setting region via GlobalOptions only accepts a String param.
            // Therefore if we raise an exception by attempting to resolve a
            // List param, we try resolving a String param instead.
            try {
                regions = params.resolveList(bdEndpoint.region, paramValues);
            }
            catch (err) {
                if (err instanceof cel_1.ExprParseError) {
                    regions = [params.resolveString(bdEndpoint.region, paramValues)];
                }
                else {
                    throw err;
                }
            }
        }
        for (const region of regions) {
            const trigger = discoverTrigger(bdEndpoint, region, r);
            if (typeof bdEndpoint.platform === "undefined") {
                throw new error_1.FirebaseError("platform can't be undefined");
            }
            const bkEndpoint = {
                id: endpointId,
                project: bdEndpoint.project,
                region: region,
                entryPoint: bdEndpoint.entryPoint,
                platform: bdEndpoint.platform,
                runtime: bdEndpoint.runtime,
                ...trigger,
            };
            proto.copyIfPresent(bkEndpoint, bdEndpoint, "environmentVariables", "labels", "secretEnvironmentVariables");
            r.resolveStrings(bkEndpoint, bdEndpoint, "serviceAccount");
            proto.convertIfPresent(bkEndpoint, bdEndpoint, "ingressSettings", (from) => {
                if (from !== null && !backend.AllIngressSettings.includes(from)) {
                    throw new error_1.FirebaseError(`Cannot set ingress settings to invalid value ${from}`);
                }
                return from;
            });
            proto.convertIfPresent(bkEndpoint, bdEndpoint, "availableMemoryMb", (from) => {
                const mem = r.resolveInt(from);
                if (mem !== null && !backend.isValidMemoryOption(mem)) {
                    throw new error_1.FirebaseError(`Function memory (${mem}) must resolve to a supported value, if present: ${JSON.stringify(allMemoryOptions)}`);
                }
                return mem || null;
            });
            r.resolveStrings(bkEndpoint, bdEndpoint, "serviceAccount");
            r.resolveInts(bkEndpoint, bdEndpoint, "timeoutSeconds", "maxInstances", "minInstances", "concurrency");
            proto.convertIfPresent(bkEndpoint, bdEndpoint, "cpu", (0, functional_1.nullsafeVisitor)((cpu) => (cpu === "gcf_gen1" ? cpu : r.resolveInt(cpu))));
            if (bdEndpoint.vpc) {
                bdEndpoint.vpc.connector = params.resolveString(bdEndpoint.vpc.connector, paramValues);
                if (bdEndpoint.vpc.connector && !bdEndpoint.vpc.connector.includes("/")) {
                    bdEndpoint.vpc.connector = `projects/${bdEndpoint.project}/locations/${region}/connectors/${bdEndpoint.vpc.connector}`;
                }
                bkEndpoint.vpc = { connector: bdEndpoint.vpc.connector };
                if (bdEndpoint.vpc.egressSettings) {
                    const egressSettings = r.resolveString(bdEndpoint.vpc.egressSettings);
                    if (!backend.isValidEgressSetting(egressSettings)) {
                        throw new error_1.FirebaseError(`Value "${egressSettings}" is an invalid ` +
                            "egress setting. Valid values are PRIVATE_RANGES_ONLY and ALL_TRAFFIC");
                    }
                    bkEndpoint.vpc.egressSettings = egressSettings;
                }
            }
            else if (bdEndpoint.vpc === null) {
                bkEndpoint.vpc = null;
            }
            bkEndpoints.push(bkEndpoint);
        }
    }
    const bkend = backend.of(...bkEndpoints);
    bkend.requiredAPIs = build.requiredAPIs;
    return bkend;
}
exports.toBackend = toBackend;
function discoverTrigger(endpoint, region, r) {
    if (isHttpsTriggered(endpoint)) {
        const httpsTrigger = {};
        if (endpoint.httpsTrigger.invoker === null) {
            httpsTrigger.invoker = null;
        }
        else if (typeof endpoint.httpsTrigger.invoker !== "undefined") {
            httpsTrigger.invoker = endpoint.httpsTrigger.invoker.map(r.resolveString);
        }
        return { httpsTrigger };
    }
    else if (isCallableTriggered(endpoint)) {
        const trigger = { callableTrigger: {} };
        proto.copyIfPresent(trigger.callableTrigger, endpoint.callableTrigger, "genkitAction");
        return trigger;
    }
    else if (isBlockingTriggered(endpoint)) {
        return { blockingTrigger: endpoint.blockingTrigger };
    }
    else if (isEventTriggered(endpoint)) {
        const eventTrigger = {
            eventType: endpoint.eventTrigger.eventType,
            retry: r.resolveBoolean(endpoint.eventTrigger.retry) || false,
        };
        if (endpoint.eventTrigger.eventFilters) {
            eventTrigger.eventFilters = (0, functional_1.mapObject)(endpoint.eventTrigger.eventFilters, r.resolveString);
        }
        if (endpoint.eventTrigger.eventFilterPathPatterns) {
            eventTrigger.eventFilterPathPatterns = (0, functional_1.mapObject)(endpoint.eventTrigger.eventFilterPathPatterns, r.resolveString);
        }
        r.resolveStrings(eventTrigger, endpoint.eventTrigger, "serviceAccount", "region", "channel");
        return { eventTrigger };
    }
    else if (isScheduleTriggered(endpoint)) {
        const bkSchedule = {
            schedule: r.resolveString(endpoint.scheduleTrigger.schedule),
        };
        if (endpoint.scheduleTrigger.timeZone !== undefined) {
            bkSchedule.timeZone = r.resolveString(endpoint.scheduleTrigger.timeZone);
        }
        if (endpoint.scheduleTrigger.retryConfig) {
            const bkRetry = {};
            r.resolveInts(bkRetry, endpoint.scheduleTrigger.retryConfig, "maxBackoffSeconds", "minBackoffSeconds", "maxRetrySeconds", "retryCount", "maxDoublings");
            bkSchedule.retryConfig = bkRetry;
        }
        else if (endpoint.scheduleTrigger.retryConfig === null) {
            bkSchedule.retryConfig = null;
        }
        return { scheduleTrigger: bkSchedule };
    }
    else if ("taskQueueTrigger" in endpoint) {
        const taskQueueTrigger = {};
        if (endpoint.taskQueueTrigger.rateLimits) {
            taskQueueTrigger.rateLimits = {};
            r.resolveInts(taskQueueTrigger.rateLimits, endpoint.taskQueueTrigger.rateLimits, "maxConcurrentDispatches", "maxDispatchesPerSecond");
        }
        else if (endpoint.taskQueueTrigger.rateLimits === null) {
            taskQueueTrigger.rateLimits = null;
        }
        if (endpoint.taskQueueTrigger.retryConfig) {
            taskQueueTrigger.retryConfig = {};
            r.resolveInts(taskQueueTrigger.retryConfig, endpoint.taskQueueTrigger.retryConfig, "maxAttempts", "maxBackoffSeconds", "minBackoffSeconds", "maxRetrySeconds", "maxDoublings");
        }
        else if (endpoint.taskQueueTrigger.retryConfig === null) {
            taskQueueTrigger.retryConfig = null;
        }
        if (endpoint.taskQueueTrigger.invoker) {
            taskQueueTrigger.invoker = endpoint.taskQueueTrigger.invoker.map(r.resolveString);
        }
        else if (endpoint.taskQueueTrigger.invoker === null) {
            taskQueueTrigger.invoker = null;
        }
        return { taskQueueTrigger };
    }
    (0, functional_1.assertExhaustive)(endpoint);
}
/**
 * Prefixes all endpoint IDs and secret names in a build with a given prefix.
 * This ensures that functions and their associated secrets from different codebases
 * remain isolated and don't conflict when deployed to the same project.
 */
function applyPrefix(build, prefix) {
    if (!prefix) {
        return;
    }
    const newEndpoints = {};
    for (const [id, endpoint] of Object.entries(build.endpoints)) {
        const newId = `${prefix}-${id}`;
        // Enforce function id constraints early for clearer errors.
        if (newId.length > 63) {
            throw new error_1.FirebaseError(`Function id '${newId}' exceeds 63 characters after applying prefix '${prefix}'. Please shorten the prefix or function name.`);
        }
        const fnIdRegex = /^[a-zA-Z][a-zA-Z0-9_-]{0,62}$/;
        if (!fnIdRegex.test(newId)) {
            throw new error_1.FirebaseError(`Function id '${newId}' is invalid after applying prefix '${prefix}'. Function names must start with a letter and can contain letters, numbers, underscores, and hyphens, with a maximum length of 63 characters.`);
        }
        newEndpoints[newId] = endpoint;
        if (endpoint.secretEnvironmentVariables) {
            endpoint.secretEnvironmentVariables = endpoint.secretEnvironmentVariables.map((secret) => ({
                ...secret,
                secret: `${prefix}-${secret.secret}`,
            }));
        }
    }
    build.endpoints = newEndpoints;
}
exports.applyPrefix = applyPrefix;
//# sourceMappingURL=build.js.map