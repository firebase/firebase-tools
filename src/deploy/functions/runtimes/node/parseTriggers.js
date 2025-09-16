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
exports.addResourcesToBackend = exports.addResourcesToBuild = exports.mergeRequiredAPIs = exports.discoverBackend = exports.discoverBuild = exports.useStrategy = void 0;
const path = __importStar(require("path"));
const _ = __importStar(require("lodash"));
const child_process_1 = require("child_process");
const error_1 = require("../../../../error");
const logger_1 = require("../../../../logger");
const backend = __importStar(require("../../backend"));
const api = __importStar(require("../../../../api"));
const proto = __importStar(require("../../../../gcp/proto"));
const events = __importStar(require("../../../../functions/events"));
const functional_1 = require("../../../../functional");
const TRIGGER_PARSER = path.resolve(__dirname, "./triggerParser.js");
/**
 * Removes any inspect options (`inspect` or `inspect-brk`) from options so the forked process is able to run (otherwise
 * it'll inherit process values and will use the same port).
 * @param options From either `process.execArgv` or `NODE_OPTIONS` envar (which is a space separated string)
 * @return `options` without any `inspect` or `inspect-brk` values
 */
function removeInspectOptions(options) {
    return options.filter((opt) => !opt.startsWith("--inspect"));
}
function parseTriggers(projectId, sourceDir, configValues, envs) {
    return new Promise((resolve, reject) => {
        const env = { ...envs };
        env.GCLOUD_PROJECT = projectId;
        if (!_.isEmpty(configValues)) {
            env.CLOUD_RUNTIME_CONFIG = JSON.stringify(configValues);
        }
        const execArgv = removeInspectOptions(process.execArgv);
        if (env.NODE_OPTIONS) {
            env.NODE_OPTIONS = removeInspectOptions(env.NODE_OPTIONS.split(" ")).join(" ");
        }
        const parser = (0, child_process_1.fork)(TRIGGER_PARSER, [sourceDir], {
            silent: true,
            env: env,
            execArgv: execArgv,
        });
        parser.on("message", (message) => {
            if (message.triggers) {
                resolve(message.triggers);
            }
            else if (message.error) {
                reject(new error_1.FirebaseError(message.error, { exit: 1 }));
            }
        });
        parser.on("exit", (code) => {
            if (code !== 0) {
                reject(new error_1.FirebaseError("There was an unknown problem while trying to parse function triggers.", { exit: 2 }));
            }
        });
    });
}
/** Currently we always use JS trigger parsing */
function useStrategy() {
    return Promise.resolve(true);
}
exports.useStrategy = useStrategy;
/**
 * Parse trigger annotations in sourceDir to generate backed.Build.
 */
async function discoverBuild(projectId, sourceDir, runtime, configValues, envs) {
    const triggerAnnotations = await parseTriggers(projectId, sourceDir, configValues, envs);
    const want = {
        requiredAPIs: [],
        endpoints: {},
        params: [],
    };
    for (const annotation of triggerAnnotations) {
        addResourcesToBuild(projectId, runtime, annotation, want);
    }
    return want;
}
exports.discoverBuild = discoverBuild;
/**
 * Parse trigger annotations in sourceDir to generate backed.Backend.
 */
async function discoverBackend(projectId, sourceDir, runtime, configValues, envs) {
    const triggerAnnotations = await parseTriggers(projectId, sourceDir, configValues, envs);
    const want = { ...backend.empty(), environmentVariables: envs };
    for (const annotation of triggerAnnotations) {
        addResourcesToBackend(projectId, runtime, annotation, want);
    }
    return want;
}
exports.discoverBackend = discoverBackend;
/**
 * Merge duplicate entries of requireAPIs in backend.Build.
 * @internal
 */
function mergeRequiredAPIs(backend) {
    const apiToReasons = {};
    for (const { api, reason } of backend.requiredAPIs) {
        const reasons = apiToReasons[api] || new Set();
        if (reason) {
            reasons.add(reason);
        }
        apiToReasons[api] = reasons;
    }
    const merged = [];
    for (const [api, reasons] of Object.entries(apiToReasons)) {
        merged.push({ api, reason: Array.from(reasons).join(" ") });
    }
    backend.requiredAPIs = merged;
}
exports.mergeRequiredAPIs = mergeRequiredAPIs;
/**
 * Transform trigger annotation into endpoints in backend.Build.
 */
function addResourcesToBuild(projectId, runtime, annotation, want) {
    Object.freeze(annotation);
    const toSeconds = (0, functional_1.nullsafeVisitor)(proto.secondsFromDuration);
    const regions = annotation.regions || [api.functionsDefaultRegion()];
    let triggered;
    const triggerCount = +!!annotation.httpsTrigger +
        +!!annotation.eventTrigger +
        +!!annotation.taskQueueTrigger +
        +!!annotation.blockingTrigger;
    if (triggerCount !== 1) {
        throw new error_1.FirebaseError("Unexpected annotation generated by the Firebase Functions SDK. This should never happen.");
    }
    if (annotation.taskQueueTrigger) {
        want.requiredAPIs.push({
            api: "cloudtasks.googleapis.com",
            reason: "Needed for task queue functions.",
        });
        triggered = {
            taskQueueTrigger: {},
        };
        proto.copyIfPresent(triggered.taskQueueTrigger, annotation.taskQueueTrigger, "invoker");
        proto.copyIfPresent(triggered.taskQueueTrigger, annotation.taskQueueTrigger, "rateLimits");
        if (annotation.taskQueueTrigger.retryConfig) {
            triggered.taskQueueTrigger.retryConfig = {};
            proto.copyIfPresent(triggered.taskQueueTrigger.retryConfig, annotation.taskQueueTrigger.retryConfig, "maxAttempts", "maxDoublings");
            proto.convertIfPresent(triggered.taskQueueTrigger.retryConfig, annotation.taskQueueTrigger.retryConfig, "minBackoffSeconds", "minBackoff", toSeconds);
            proto.convertIfPresent(triggered.taskQueueTrigger.retryConfig, annotation.taskQueueTrigger.retryConfig, "maxBackoffSeconds", "maxBackoff", toSeconds);
            proto.convertIfPresent(triggered.taskQueueTrigger.retryConfig, annotation.taskQueueTrigger.retryConfig, "maxRetrySeconds", "maxRetryDuration", toSeconds);
        }
    }
    else if (annotation.httpsTrigger) {
        if (annotation.labels?.["deployment-callable"]) {
            delete annotation.labels["deployment-callable"];
            triggered = { callableTrigger: {} };
        }
        else {
            const trigger = {};
            if (annotation.failurePolicy) {
                logger_1.logger.warn(`Ignoring retry policy for HTTPS function ${annotation.name}`);
            }
            if (annotation.httpsTrigger.invoker) {
                trigger.invoker = annotation.httpsTrigger.invoker;
            }
            triggered = { httpsTrigger: trigger };
        }
    }
    else if (annotation.schedule) {
        want.requiredAPIs.push({
            api: "cloudscheduler.googleapis.com",
            reason: "Needed for scheduled functions.",
        });
        triggered = {
            scheduleTrigger: {
                schedule: annotation.schedule.schedule,
                timeZone: annotation.schedule.timeZone ?? null,
                retryConfig: {},
            },
        };
        if (annotation.schedule.retryConfig) {
            triggered.scheduleTrigger.retryConfig = {};
            proto.copyIfPresent(triggered.scheduleTrigger.retryConfig, annotation.schedule.retryConfig, "retryCount", "maxDoublings");
            proto.convertIfPresent(triggered.scheduleTrigger.retryConfig, annotation.schedule.retryConfig, "maxRetrySeconds", "maxRetryDuration", toSeconds);
            proto.convertIfPresent(triggered.scheduleTrigger.retryConfig, annotation.schedule.retryConfig, "minBackoffSeconds", "minBackoffDuration", toSeconds);
            proto.convertIfPresent(triggered.scheduleTrigger.retryConfig, annotation.schedule.retryConfig, "maxBackoffSeconds", "maxBackoffDuration", toSeconds);
        }
    }
    else if (annotation.blockingTrigger) {
        if (events.v1.AUTH_BLOCKING_EVENTS.includes(annotation.blockingTrigger.eventType)) {
            want.requiredAPIs.push({
                api: "identitytoolkit.googleapis.com",
                reason: "Needed for auth blocking functions.",
            });
        }
        triggered = {
            blockingTrigger: {
                eventType: annotation.blockingTrigger.eventType,
            },
        };
    }
    else if (annotation.eventTrigger) {
        triggered = {
            eventTrigger: {
                eventType: annotation.eventTrigger.eventType,
                eventFilters: { resource: annotation.eventTrigger.resource },
                retry: !!annotation.failurePolicy,
            },
        };
    }
    else {
        throw new error_1.FirebaseError("Do not understand Cloud Function annotation without a trigger" +
            JSON.stringify(annotation, null, 2));
    }
    const endpointId = annotation.name;
    const endpoint = {
        platform: annotation.platform || "gcfv1",
        region: regions,
        project: projectId,
        entryPoint: annotation.entryPoint,
        runtime: runtime,
        ...triggered,
    };
    proto.renameIfPresent(endpoint, annotation, "serviceAccount", "serviceAccountEmail");
    if (annotation.vpcConnector != null) {
        endpoint.vpc = { connector: annotation.vpcConnector };
        proto.renameIfPresent(endpoint.vpc, annotation, "egressSettings", "vpcConnectorEgressSettings");
    }
    proto.copyIfPresent(endpoint, annotation, "concurrency", "labels", "maxInstances", "minInstances", "availableMemoryMb");
    proto.convertIfPresent(endpoint, annotation, "ingressSettings", (str) => {
        if (str === null) {
            return null;
        }
        if (!backend.AllIngressSettings.includes(str)) {
            throw new Error(`Invalid ingress setting ${str}`);
        }
        return str;
    });
    proto.convertIfPresent(endpoint, annotation, "timeoutSeconds", "timeout", proto.secondsFromDuration);
    if (annotation.secrets) {
        endpoint.secretEnvironmentVariables = annotation.secrets.map((secret) => {
            return {
                secret,
                projectId,
                key: secret,
            };
        });
    }
    want.endpoints[endpointId] = endpoint;
}
exports.addResourcesToBuild = addResourcesToBuild;
/**
 * Transform trigger annotation into endpoints in backend.Backend.
 */
function addResourcesToBackend(projectId, runtime, annotation, want) {
    Object.freeze(annotation);
    // Every trigger annotation is at least a function
    for (const region of annotation.regions || [api.functionsDefaultRegion()]) {
        let triggered;
        // +!! is 1 for truthy values and 0 for falsy values
        const triggerCount = +!!annotation.httpsTrigger +
            +!!annotation.eventTrigger +
            +!!annotation.taskQueueTrigger +
            +!!annotation.blockingTrigger;
        if (triggerCount !== 1) {
            throw new error_1.FirebaseError("Unexpected annotation generated by the Firebase Functions SDK. This should never happen.");
        }
        if (annotation.taskQueueTrigger) {
            triggered = { taskQueueTrigger: annotation.taskQueueTrigger };
            want.requiredAPIs.push({
                api: "cloudtasks.googleapis.com",
                reason: "Needed for task queue functions.",
            });
        }
        else if (annotation.httpsTrigger) {
            if (annotation.labels?.["deployment-callable"]) {
                delete annotation.labels["deployment-callable"];
                triggered = { callableTrigger: {} };
            }
            else {
                const trigger = {};
                if (annotation.failurePolicy) {
                    logger_1.logger.warn(`Ignoring retry policy for HTTPS function ${annotation.name}`);
                }
                proto.copyIfPresent(trigger, annotation.httpsTrigger, "invoker");
                triggered = { httpsTrigger: trigger };
            }
        }
        else if (annotation.schedule) {
            want.requiredAPIs.push({
                api: "cloudscheduler.googleapis.com",
                reason: "Needed for scheduled functions.",
            });
            triggered = { scheduleTrigger: annotation.schedule };
        }
        else if (annotation.blockingTrigger) {
            if (events.v1.AUTH_BLOCKING_EVENTS.includes(annotation.blockingTrigger.eventType)) {
                want.requiredAPIs.push({
                    api: "identitytoolkit.googleapis.com",
                    reason: "Needed for auth blocking functions.",
                });
            }
            triggered = {
                blockingTrigger: {
                    eventType: annotation.blockingTrigger.eventType,
                    options: annotation.blockingTrigger.options,
                },
            };
        }
        else {
            triggered = {
                eventTrigger: {
                    eventType: annotation.eventTrigger.eventType,
                    eventFilters: { resource: annotation.eventTrigger.resource },
                    retry: !!annotation.failurePolicy,
                },
            };
            // TODO: yank this edge case for a v2 trigger on the pre-container contract
            // once we use container contract for the functionsv2 experiment.
            if (annotation.platform === "gcfv2") {
                if (annotation.eventTrigger.eventType === events.v2.PUBSUB_PUBLISH_EVENT) {
                    triggered.eventTrigger.eventFilters = { topic: annotation.eventTrigger.resource };
                }
                if (events.v2.STORAGE_EVENTS.find((event) => event === (annotation.eventTrigger?.eventType || ""))) {
                    triggered.eventTrigger.eventFilters = { bucket: annotation.eventTrigger.resource };
                }
            }
        }
        const endpoint = {
            platform: annotation.platform || "gcfv1",
            id: annotation.name,
            region: region,
            project: projectId,
            entryPoint: annotation.entryPoint,
            runtime: runtime,
            ...triggered,
        };
        if (annotation.vpcConnector != null) {
            let maybeId = annotation.vpcConnector;
            if (maybeId && !maybeId.includes("/")) {
                maybeId = `projects/${projectId}/locations/${region}/connectors/${maybeId}`;
            }
            endpoint.vpc = { connector: maybeId };
            proto.renameIfPresent(endpoint.vpc, annotation, "egressSettings", "vpcConnectorEgressSettings");
        }
        if (annotation.secrets) {
            const secretEnvs = [];
            for (const secret of annotation.secrets) {
                const secretEnv = {
                    secret,
                    projectId,
                    key: secret,
                };
                secretEnvs.push(secretEnv);
            }
            endpoint.secretEnvironmentVariables = secretEnvs;
        }
        proto.copyIfPresent(endpoint, annotation, "concurrency", "labels", "maxInstances", "minInstances");
        proto.renameIfPresent(endpoint, annotation, "serviceAccount", "serviceAccountEmail");
        proto.convertIfPresent(endpoint, annotation, "ingressSettings", (ingress) => {
            if (ingress == null) {
                return null;
            }
            if (!backend.AllIngressSettings.includes(ingress)) {
                throw new error_1.FirebaseError(`Invalid ingress setting ${ingress}`);
            }
            return ingress;
        });
        proto.convertIfPresent(endpoint, annotation, "availableMemoryMb", (mem) => {
            if (mem === null) {
                return null;
            }
            if (!backend.isValidMemoryOption(mem)) {
                throw new error_1.FirebaseError(`This version of firebase-tools does not know about the memory option ${mem}. Is an upgrade necessary?`);
            }
            return mem;
        });
        proto.convertIfPresent(endpoint, annotation, "timeoutSeconds", "timeout", proto.secondsFromDuration);
        want.endpoints[region] = want.endpoints[region] || {};
        want.endpoints[region][endpoint.id] = endpoint;
        mergeRequiredAPIs(want);
    }
}
exports.addResourcesToBackend = addResourcesToBackend;
//# sourceMappingURL=parseTriggers.js.map