"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildFromV1Alpha1 = void 0;
const build = require("../../build");
const backend = require("../../backend");
const proto_1 = require("../../../../gcp/proto");
const parsing_1 = require("./parsing");
const error_1 = require("../../../../error");
const functional_1 = require("../../../../functional");
const CHANNEL_NAME_REGEX = new RegExp("(projects\\/" +
    "(?<project>(?:\\d+)|(?:[A-Za-z]+[A-Za-z\\d-]*[A-Za-z\\d]?))\\/)?" +
    "locations\\/" +
    "(?<location>[A-Za-z\\d\\-_]+)\\/" +
    "channels\\/" +
    "(?<channel>[A-Za-z\\d\\-_]+)");
/** Returns a Build from a v1alpha1 Manifest. */
function buildFromV1Alpha1(yaml, project, region, runtime) {
    const manifest = JSON.parse(JSON.stringify(yaml));
    (0, parsing_1.requireKeys)("", manifest, "endpoints");
    (0, parsing_1.assertKeyTypes)("", manifest, {
        specVersion: "string",
        params: "array",
        requiredAPIs: "array",
        endpoints: "object",
        extensions: "object",
    });
    const bd = build.empty();
    bd.params = manifest.params || [];
    bd.requiredAPIs = parseRequiredAPIs(manifest);
    for (const id of Object.keys(manifest.endpoints)) {
        const me = manifest.endpoints[id];
        assertBuildEndpoint(me, id);
        const be = parseEndpointForBuild(id, me, project, region, runtime);
        bd.endpoints[id] = be;
    }
    if (manifest.extensions) {
        bd.extensions = {};
        for (const id of Object.keys(manifest.extensions)) {
            const me = manifest.extensions[id];
            assertBuildExtension(me, id);
            const be = parseExtensionForBuild(me);
            bd.extensions[id] = be;
        }
    }
    return bd;
}
exports.buildFromV1Alpha1 = buildFromV1Alpha1;
function parseRequiredAPIs(manifest) {
    const requiredAPIs = manifest.requiredAPIs || [];
    for (const { api, reason } of requiredAPIs) {
        if (typeof api !== "string") {
            throw new error_1.FirebaseError(`Invalid api "${JSON.stringify(api)}. Expected string`);
        }
        if (typeof reason !== "string") {
            throw new error_1.FirebaseError(`Invalid reason "${JSON.stringify(reason)} for API ${api}. Expected string`);
        }
    }
    return requiredAPIs;
}
function assertBuildEndpoint(ep, id) {
    const prefix = `endpoints[${id}]`;
    (0, parsing_1.assertKeyTypes)(prefix, ep, {
        region: "List",
        platform: (platform) => build.AllFunctionsPlatforms.includes(platform),
        entryPoint: "string",
        omit: "Field<boolean>?",
        availableMemoryMb: (mem) => mem === null || isCEL(mem) || backend.isValidMemoryOption(mem),
        maxInstances: "Field<number>?",
        minInstances: "Field<number>?",
        concurrency: "Field<number>?",
        serviceAccount: "Field<string>?",
        serviceAccountEmail: "Field<string>?",
        timeoutSeconds: "Field<number>?",
        vpc: "object?",
        labels: "object?",
        ingressSettings: (setting) => setting === null || build.AllIngressSettings.includes(setting),
        environmentVariables: "object?",
        secretEnvironmentVariables: "array?",
        httpsTrigger: "object",
        callableTrigger: "object",
        eventTrigger: "object",
        scheduleTrigger: "object",
        taskQueueTrigger: "object",
        blockingTrigger: "object",
        cpu: (cpu) => cpu === null || isCEL(cpu) || cpu === "gcf_gen1" || typeof cpu === "number",
    });
    if (ep.vpc) {
        (0, parsing_1.assertKeyTypes)(prefix + ".vpc", ep.vpc, {
            connector: "string",
            egressSettings: (setting) => setting === null || build.AllVpcEgressSettings.includes(setting),
        });
        (0, parsing_1.requireKeys)(prefix + ".vpc", ep.vpc, "connector");
    }
    let triggerCount = 0;
    if (ep.httpsTrigger) {
        triggerCount++;
    }
    if (ep.callableTrigger) {
        triggerCount++;
    }
    if (ep.eventTrigger) {
        triggerCount++;
    }
    if (ep.scheduleTrigger) {
        triggerCount++;
    }
    if (ep.taskQueueTrigger) {
        triggerCount++;
    }
    if (ep.blockingTrigger) {
        triggerCount++;
    }
    if (!triggerCount) {
        throw new error_1.FirebaseError("Expected trigger in endpoint " + id);
    }
    if (triggerCount > 1) {
        throw new error_1.FirebaseError("Multiple triggers defined for endpoint" + id);
    }
    if (build.isEventTriggered(ep)) {
        (0, parsing_1.requireKeys)(prefix + ".eventTrigger", ep.eventTrigger, "eventType", "eventFilters");
        (0, parsing_1.assertKeyTypes)(prefix + ".eventTrigger", ep.eventTrigger, {
            eventFilters: "object",
            eventFilterPathPatterns: "object",
            eventType: "string",
            retry: "Field<boolean>",
            region: "Field<string>",
            serviceAccount: "Field<string>?",
            serviceAccountEmail: "Field<string>?",
            channel: "string",
        });
    }
    else if (build.isHttpsTriggered(ep)) {
        (0, parsing_1.assertKeyTypes)(prefix + ".httpsTrigger", ep.httpsTrigger, {
            invoker: "array?",
        });
    }
    else if (build.isCallableTriggered(ep)) {
        (0, parsing_1.assertKeyTypes)(prefix + ".callableTrigger", ep.callableTrigger, {
            genkitAction: "string?",
        });
    }
    else if (build.isScheduleTriggered(ep)) {
        (0, parsing_1.assertKeyTypes)(prefix + ".scheduleTrigger", ep.scheduleTrigger, {
            schedule: "Field<string>",
            timeZone: "Field<string>?",
            retryConfig: "object?",
        });
        if (ep.scheduleTrigger.retryConfig) {
            (0, parsing_1.assertKeyTypes)(prefix + ".scheduleTrigger.retryConfig", ep.scheduleTrigger.retryConfig, {
                retryCount: "Field<number>?",
                maxDoublings: "Field<number>?",
                minBackoffSeconds: "Field<number>?",
                maxBackoffSeconds: "Field<number>?",
                maxRetrySeconds: "Field<number>?",
                // The "duration" key types are supported for legacy compatibility reasons only.
                // They are not parametized and are automatically converted by the parser to seconds.
                maxRetryDuration: "string?",
                minBackoffDuration: "string?",
                maxBackoffDuration: "string?",
            });
        }
    }
    else if (build.isTaskQueueTriggered(ep)) {
        (0, parsing_1.assertKeyTypes)(prefix + ".taskQueueTrigger", ep.taskQueueTrigger, {
            rateLimits: "object?",
            retryConfig: "object?",
            invoker: "array?",
        });
        if (ep.taskQueueTrigger.rateLimits) {
            (0, parsing_1.assertKeyTypes)(prefix + ".taskQueueTrigger.rateLimits", ep.taskQueueTrigger.rateLimits, {
                maxConcurrentDispatches: "Field<number>?",
                maxDispatchesPerSecond: "Field<number>?",
            });
        }
        if (ep.taskQueueTrigger.retryConfig) {
            (0, parsing_1.assertKeyTypes)(prefix + ".taskQueueTrigger.retryConfig", ep.taskQueueTrigger.retryConfig, {
                maxAttempts: "Field<number>?",
                maxRetrySeconds: "Field<number>?",
                minBackoffSeconds: "Field<number>?",
                maxBackoffSeconds: "Field<number>?",
                maxDoublings: "Field<number>?",
            });
        }
    }
    else if (build.isBlockingTriggered(ep)) {
        (0, parsing_1.requireKeys)(prefix + ".blockingTrigger", ep.blockingTrigger, "eventType");
        (0, parsing_1.assertKeyTypes)(prefix + ".blockingTrigger", ep.blockingTrigger, {
            eventType: "string",
            options: "object",
        });
    }
    else {
        // TODO: Replace with assertExhaustive, which needs some type magic here because we have an any
        throw new error_1.FirebaseError(`Do not recognize trigger type for endpoint ${id}. Try upgrading ` +
            "firebase-tools with npm install -g firebase-tools@latest");
    }
}
function parseEndpointForBuild(id, ep, project, defaultRegion, runtime) {
    var _a;
    let triggered;
    if (build.isEventTriggered(ep)) {
        const eventTrigger = {
            eventType: ep.eventTrigger.eventType,
            retry: ep.eventTrigger.retry,
        };
        // Allow serviceAccountEmail but prefer serviceAccount
        if ("serviceAccountEmail" in ep.eventTrigger) {
            eventTrigger.serviceAccount = ep.eventTrigger.serviceAccountEmail;
        }
        (0, proto_1.copyIfPresent)(eventTrigger, ep.eventTrigger, "serviceAccount", "eventFilterPathPatterns", "region");
        (0, proto_1.convertIfPresent)(eventTrigger, ep.eventTrigger, "channel", (c) => resolveChannelName(project, c, defaultRegion));
        (0, proto_1.convertIfPresent)(eventTrigger, ep.eventTrigger, "eventFilters", (filters) => {
            const copy = Object.assign({}, filters);
            if (copy["topic"] && !copy["topic"].startsWith("projects/")) {
                copy["topic"] = `projects/${project}/topics/${copy["topic"]}`;
            }
            return copy;
        });
        triggered = { eventTrigger };
    }
    else if (build.isHttpsTriggered(ep)) {
        triggered = { httpsTrigger: {} };
        (0, proto_1.copyIfPresent)(triggered.httpsTrigger, ep.httpsTrigger, "invoker");
    }
    else if (build.isCallableTriggered(ep)) {
        triggered = { callableTrigger: {} };
        (0, proto_1.copyIfPresent)(triggered.callableTrigger, ep.callableTrigger, "genkitAction");
    }
    else if (build.isScheduleTriggered(ep)) {
        const st = {
            // TODO: consider adding validation for fields like this that reject
            // invalid values before actually modifying prod.
            schedule: ep.scheduleTrigger.schedule || "",
            timeZone: (_a = ep.scheduleTrigger.timeZone) !== null && _a !== void 0 ? _a : null,
        };
        if (ep.scheduleTrigger.retryConfig) {
            st.retryConfig = {};
            (0, proto_1.convertIfPresent)(st.retryConfig, ep.scheduleTrigger.retryConfig, "maxBackoffSeconds", "maxBackoffDuration", (duration) => (duration === null ? null : (0, proto_1.secondsFromDuration)(duration)));
            (0, proto_1.convertIfPresent)(st.retryConfig, ep.scheduleTrigger.retryConfig, "minBackoffSeconds", "minBackoffDuration", (duration) => (duration === null ? null : (0, proto_1.secondsFromDuration)(duration)));
            (0, proto_1.convertIfPresent)(st.retryConfig, ep.scheduleTrigger.retryConfig, "maxRetrySeconds", "maxRetryDuration", (duration) => (duration === null ? null : (0, proto_1.secondsFromDuration)(duration)));
            (0, proto_1.copyIfPresent)(st.retryConfig, ep.scheduleTrigger.retryConfig, "retryCount", "minBackoffSeconds", "maxBackoffSeconds", "maxRetrySeconds", "maxDoublings");
            (0, proto_1.convertIfPresent)(st.retryConfig, ep.scheduleTrigger.retryConfig, "minBackoffSeconds", "minBackoffDuration", (0, functional_1.nullsafeVisitor)(proto_1.secondsFromDuration));
            (0, proto_1.convertIfPresent)(st.retryConfig, ep.scheduleTrigger.retryConfig, "maxBackoffSeconds", "maxBackoffDuration", (0, functional_1.nullsafeVisitor)(proto_1.secondsFromDuration));
            (0, proto_1.convertIfPresent)(st.retryConfig, ep.scheduleTrigger.retryConfig, "maxRetrySeconds", "maxRetryDuration", (0, functional_1.nullsafeVisitor)(proto_1.secondsFromDuration));
        }
        else if (ep.scheduleTrigger.retryConfig === null) {
            st.retryConfig = null;
        }
        triggered = { scheduleTrigger: st };
    }
    else if (build.isTaskQueueTriggered(ep)) {
        const tq = {};
        if (ep.taskQueueTrigger.invoker) {
            tq.invoker = ep.taskQueueTrigger.invoker;
        }
        else if (ep.taskQueueTrigger.invoker === null) {
            tq.invoker = null;
        }
        if (ep.taskQueueTrigger.retryConfig) {
            tq.retryConfig = Object.assign({}, ep.taskQueueTrigger.retryConfig);
        }
        else if (ep.taskQueueTrigger.retryConfig === null) {
            tq.retryConfig = null;
        }
        if (ep.taskQueueTrigger.rateLimits) {
            tq.rateLimits = Object.assign({}, ep.taskQueueTrigger.rateLimits);
        }
        else if (ep.taskQueueTrigger.rateLimits === null) {
            tq.rateLimits = null;
        }
        triggered = { taskQueueTrigger: tq };
    }
    else if (ep.blockingTrigger) {
        triggered = { blockingTrigger: ep.blockingTrigger };
    }
    else {
        throw new error_1.FirebaseError(`Do not recognize trigger type for endpoint ${id}. Try upgrading ` +
            "firebase-tools with npm install -g firebase-tools@latest");
    }
    const parsed = Object.assign({ platform: ep.platform || "gcfv2", region: ep.region || [defaultRegion], project,
        runtime, entryPoint: ep.entryPoint }, triggered);
    // Allow "serviceAccountEmail" but prefer "serviceAccount"
    if ("serviceAccountEmail" in ep) {
        parsed.serviceAccount = ep.serviceAccountEmail;
    }
    (0, proto_1.copyIfPresent)(parsed, ep, "omit", "availableMemoryMb", "cpu", "maxInstances", "minInstances", "concurrency", "timeoutSeconds", "vpc", "labels", "ingressSettings", "environmentVariables", "serviceAccount");
    (0, proto_1.convertIfPresent)(parsed, ep, "secretEnvironmentVariables", (senvs) => {
        if (!senvs) {
            return null;
        }
        return senvs.map(({ key, secret }) => {
            return { key, secret: secret || key, projectId: project };
        });
    });
    return parsed;
}
function assertBuildExtension(ex, id) {
    const prefix = `extensions[${id}]`;
    (0, parsing_1.assertKeyTypes)(prefix, ex, {
        params: "object",
        ref: "string?",
        localPath: "string?",
        events: "array",
    });
    let refOrPath = 0;
    if (ex.ref) {
        refOrPath++;
    }
    if (ex.localPath) {
        refOrPath++;
    }
    if (refOrPath === 0) {
        throw new error_1.FirebaseError(`Expected either extension reference or local path in extension: ${id}`);
    }
    if (refOrPath > 1) {
        throw new error_1.FirebaseError(`Multiple definitions for extension ${id}. Do not specify both reference and local path.`);
    }
}
function parseExtensionForBuild(ex) {
    const parsed = {
        params: {},
        events: [],
    };
    if (ex.localPath) {
        parsed.localPath = ex.localPath;
    }
    else {
        parsed.ref = ex.ref;
    }
    (0, proto_1.copyIfPresent)(parsed, ex, "params", "events");
    return parsed;
}
function resolveChannelName(projectId, channel, defaultRegion) {
    if (!channel.includes("/")) {
        const location = defaultRegion;
        const channelId = channel;
        return "projects/" + projectId + "/locations/" + location + "/channels/" + channelId;
    }
    const match = CHANNEL_NAME_REGEX.exec(channel);
    if (!(match === null || match === void 0 ? void 0 : match.groups)) {
        throw new error_1.FirebaseError("Invalid channel name format.");
    }
    const matchedProjectId = match.groups.project;
    const location = match.groups.location;
    const channelId = match.groups.channel;
    if (matchedProjectId) {
        return "projects/" + matchedProjectId + "/locations/" + location + "/channels/" + channelId;
    }
    else {
        return "projects/" + projectId + "/locations/" + location + "/channels/" + channelId;
    }
}
function isCEL(expr) {
    return typeof expr === "string" && expr.includes("{{") && expr.includes("}}");
}
