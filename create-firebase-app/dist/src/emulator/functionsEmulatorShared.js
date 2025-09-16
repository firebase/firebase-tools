"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toBackendInfo = exports.getSecretLocalPath = exports.getSignatureType = exports.formatHost = exports.findModuleRoot = exports.waitForBody = exports.getServiceFromEventType = exports.getFunctionService = exports.getTemporarySocketPath = exports.getEmulatedTriggersFromDefinitions = exports.emulatedFunctionsByRegion = exports.emulatedFunctionsFromEndpoints = exports.prepareEndpoints = exports.eventServiceImplemented = exports.EmulatedTrigger = exports.HttpConstants = exports.EVENTARC_SOURCE_ENV = void 0;
const os = require("os");
const path = require("path");
const fs = require("fs");
const crypto_1 = require("crypto");
const _ = require("lodash");
const backend = require("../deploy/functions/backend");
const constants_1 = require("./constants");
const manifest_1 = require("../extensions/manifest");
const extensionsHelper_1 = require("../extensions/extensionsHelper");
const postinstall_1 = require("./extensions/postinstall");
const services_1 = require("../deploy/functions/services");
const prepare_1 = require("../deploy/functions/prepare");
const events = require("../functions/events");
const utils_1 = require("../utils");
/** The current v2 events that are implemented in the emulator */
const V2_EVENTS = [
    events.v2.PUBSUB_PUBLISH_EVENT,
    events.v2.FIREALERTS_EVENT,
    ...events.v2.STORAGE_EVENTS,
    ...events.v2.DATABASE_EVENTS,
    ...events.v2.FIRESTORE_EVENTS,
];
/**
 * Label for eventarc event sources.
 * TODO: Consider DRYing from functions/prepare.ts
 * A nice place would be to put it in functionsv2.ts once we get rid of functions.ts
 */
exports.EVENTARC_SOURCE_ENV = "EVENTARC_CLOUD_EVENT_SOURCE";
class HttpConstants {
}
exports.HttpConstants = HttpConstants;
HttpConstants.CALLABLE_AUTH_HEADER = "x-callable-context-auth";
HttpConstants.ORIGINAL_AUTH_HEADER = "x-original-auth";
class EmulatedTrigger {
    /*
    Here we create a trigger from a single definition (data about what resources does this trigger on, etc) and
    the actual module which contains multiple functions / definitions. We locate the one we need below using
    definition.entryPoint
     */
    constructor(definition, module) {
        this.definition = definition;
        this.module = module;
    }
    get memoryLimitBytes() {
        return (this.definition.availableMemoryMb || 128) * 1024 * 1024;
    }
    get timeoutMs() {
        return (this.definition.timeoutSeconds || 60) * 1000;
    }
    getRawFunction() {
        if (!this.module) {
            throw new Error("EmulatedTrigger has not been provided a module.");
        }
        const func = _.get(this.module, this.definition.entryPoint);
        return func.__emulator_func || func;
    }
}
exports.EmulatedTrigger = EmulatedTrigger;
/**
 * Checks if the v2 event service has been implemented in the emulator
 */
function eventServiceImplemented(eventType) {
    return V2_EVENTS.includes(eventType);
}
exports.eventServiceImplemented = eventServiceImplemented;
/**
 * Validates that triggers are correctly formed and fills in some defaults.
 */
function prepareEndpoints(endpoints) {
    const bkend = backend.of(...endpoints);
    for (const ep of endpoints) {
        (0, services_1.serviceForEndpoint)(ep).validateTrigger(ep, bkend);
    }
    (0, prepare_1.inferBlockingDetails)(bkend);
}
exports.prepareEndpoints = prepareEndpoints;
/**
 * Creates a unique trigger definition from Endpoints.
 * @param Endpoints A list of all CloudFunctions in the deployment.
 * @return A list of all CloudFunctions in the deployment.
 */
function emulatedFunctionsFromEndpoints(endpoints) {
    var _a, _b, _c, _d, _e, _f, _g;
    const regionDefinitions = [];
    for (const endpoint of endpoints) {
        if (!endpoint.region) {
            endpoint.region = "us-central1";
        }
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const def = {
            entryPoint: endpoint.entryPoint,
            platform: endpoint.platform,
            region: endpoint.region,
            // TODO: Difference in use of name/id in Endpoint vs Emulator is subtle and confusing.
            // We should later refactor the emulator to stop using a custom trigger definition.
            name: endpoint.id,
            id: `${endpoint.region}-${endpoint.id}`,
            codebase: endpoint.codebase,
        };
        def.availableMemoryMb = endpoint.availableMemoryMb || 256;
        def.labels = endpoint.labels || {};
        if (endpoint.platform === "gcfv1") {
            def.labels[exports.EVENTARC_SOURCE_ENV] =
                "cloudfunctions-emulated.googleapis.com" +
                    `/projects/${endpoint.project || "project"}/locations/${endpoint.region}/functions/${endpoint.id}`;
        }
        else if (endpoint.platform === "gcfv2") {
            def.labels[exports.EVENTARC_SOURCE_ENV] =
                "run-emulated.googleapis.com" +
                    `/projects/${endpoint.project || "project"}/locations/${endpoint.region}/services/${endpoint.id}`;
        }
        def.timeoutSeconds = endpoint.timeoutSeconds || 60;
        def.secretEnvironmentVariables = endpoint.secretEnvironmentVariables || [];
        def.platform = endpoint.platform;
        // TODO: This transformation is confusing but must be kept since the Firestore/RTDB trigger registration
        // process requires it in this form. Need to work in Firestore emulator for a proper fix...
        if (backend.isHttpsTriggered(endpoint)) {
            def.httpsTrigger = endpoint.httpsTrigger;
        }
        else if (backend.isCallableTriggered(endpoint)) {
            def.httpsTrigger = {};
            def.labels = Object.assign(Object.assign({}, def.labels), { "deployment-callable": "true" });
        }
        else if (backend.isEventTriggered(endpoint)) {
            const eventTrigger = endpoint.eventTrigger;
            if (endpoint.platform === "gcfv1") {
                def.eventTrigger = {
                    eventType: eventTrigger.eventType,
                    resource: eventTrigger.eventFilters.resource,
                };
            }
            else {
                // TODO(colerogers): v2 events implemented are pubsub, storage, rtdb, and custom events
                if (!eventServiceImplemented(eventTrigger.eventType) && !eventTrigger.channel) {
                    continue;
                }
                // We use resource for pubsub & storage
                const { resource, topic, bucket } = endpoint.eventTrigger.eventFilters;
                const eventResource = resource || topic || bucket;
                def.eventTrigger = {
                    eventType: eventTrigger.eventType,
                    resource: eventResource,
                    channel: eventTrigger.channel,
                    eventFilters: eventTrigger.eventFilters,
                    eventFilterPathPatterns: eventTrigger.eventFilterPathPatterns,
                };
            }
        }
        else if (backend.isScheduleTriggered(endpoint)) {
            // TODO: This is an awkward transformation. Emulator does not understand scheduled triggers - maybe it should?
            def.eventTrigger = { eventType: "pubsub", resource: "" };
            def.schedule = endpoint.scheduleTrigger;
        }
        else if (backend.isBlockingTriggered(endpoint)) {
            def.blockingTrigger = {
                eventType: endpoint.blockingTrigger.eventType,
                options: endpoint.blockingTrigger.options || {},
            };
        }
        else if (backend.isTaskQueueTriggered(endpoint)) {
            def.httpsTrigger = {};
            def.taskQueueTrigger = {
                retryConfig: {
                    maxAttempts: (_a = endpoint.taskQueueTrigger.retryConfig) === null || _a === void 0 ? void 0 : _a.maxAttempts,
                    maxRetrySeconds: (_b = endpoint.taskQueueTrigger.retryConfig) === null || _b === void 0 ? void 0 : _b.maxRetrySeconds,
                    maxBackoffSeconds: (_c = endpoint.taskQueueTrigger.retryConfig) === null || _c === void 0 ? void 0 : _c.maxBackoffSeconds,
                    maxDoublings: (_d = endpoint.taskQueueTrigger.retryConfig) === null || _d === void 0 ? void 0 : _d.maxDoublings,
                    minBackoffSeconds: (_e = endpoint.taskQueueTrigger.retryConfig) === null || _e === void 0 ? void 0 : _e.minBackoffSeconds,
                },
                rateLimits: {
                    maxConcurrentDispatches: (_f = endpoint.taskQueueTrigger.rateLimits) === null || _f === void 0 ? void 0 : _f.maxConcurrentDispatches,
                    maxDispatchesPerSecond: (_g = endpoint.taskQueueTrigger.rateLimits) === null || _g === void 0 ? void 0 : _g.maxDispatchesPerSecond,
                },
            };
        }
        else {
            // All other trigger types are not supported by the emulator
            // We leave both eventTrigger and httpTrigger attributes empty
            // and let the caller deal with invalid triggers.
        }
        regionDefinitions.push(def);
    }
    return regionDefinitions;
}
exports.emulatedFunctionsFromEndpoints = emulatedFunctionsFromEndpoints;
/**
 * Creates a unique trigger definition for each region a function is defined in.
 * @param definitions A list of all CloudFunctions in the deployment.
 * @return A list of all CloudFunctions in the deployment, with copies for each region.
 */
function emulatedFunctionsByRegion(definitions, secretEnvVariables = []) {
    const regionDefinitions = [];
    for (const def of definitions) {
        if (!def.regions) {
            def.regions = ["us-central1"];
        }
        // Create a separate CloudFunction for
        // each region we deploy a function to
        for (const region of def.regions) {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            const defDeepCopy = JSON.parse(JSON.stringify(def));
            defDeepCopy.regions = [region];
            defDeepCopy.region = region;
            defDeepCopy.id = `${region}-${defDeepCopy.name}`;
            defDeepCopy.platform = defDeepCopy.platform || "gcfv1";
            defDeepCopy.secretEnvironmentVariables = secretEnvVariables;
            regionDefinitions.push(defDeepCopy);
        }
    }
    return regionDefinitions;
}
exports.emulatedFunctionsByRegion = emulatedFunctionsByRegion;
/**
 * Converts an array of EmulatedTriggerDefinitions to a map of EmulatedTriggers, which contain information on execution,
 * @param {EmulatedTriggerDefinition[]} definitions An array of regionalized, parsed trigger definitions
 * @param {object} module Actual module which contains multiple functions / definitions
 * @return a map of trigger ids to EmulatedTriggers
 */
function getEmulatedTriggersFromDefinitions(definitions, module) {
    return definitions.reduce((obj, definition) => {
        obj[definition.id] = new EmulatedTrigger(definition, module);
        return obj;
    }, {});
}
exports.getEmulatedTriggersFromDefinitions = getEmulatedTriggersFromDefinitions;
/**
 * Create a path that used to create a tempfile for IPC over socket files.
 */
function getTemporarySocketPath() {
    // See "net" package docs for information about IPC pipes on Windows
    // https://nodejs.org/api/net.html#net_identifying_paths_for_ipc_connections
    //
    // As noted in the linked documentation the socket path is truncated at a certain
    // length:
    // > On Unix, the local domain is also known as the Unix domain. The path is a filesystem pathname.
    // > It gets truncated to a length of sizeof(sockaddr_un.sun_path) - 1, which varies 91 and 107 bytes
    // > depending on the operating system. The typical values are 107 on Linux and 103 on macOS.
    //
    // On Mac our socket paths will begin with something like this:
    //   /var/folders/xl/6lkrzp7j07581mw8_4dlt3b000643s/T/{...}.sock
    // Since the system prefix is about ~50 chars we only have about ~50 more to work with
    // before we will get truncated socket names and then undefined behavior.
    const rand = (0, crypto_1.randomBytes)(8).toString("hex");
    if (process.platform === "win32") {
        return path.join("\\\\?\\pipe", `fire_emu_${rand}`);
    }
    else {
        return path.join(os.tmpdir(), `fire_emu_${rand}.sock`);
    }
}
exports.getTemporarySocketPath = getTemporarySocketPath;
/**
 * In GCF 1st gen, there was a mostly undocumented "service" field
 * which identified where an event was coming from. This is used in the emulator
 * to determine which emulator serves these triggers. Now that GCF 2nd gen
 * discontinued the "service" field this becomes more bespoke.
 */
function getFunctionService(def) {
    var _a;
    if (def.eventTrigger) {
        if (def.eventTrigger.channel) {
            return constants_1.Constants.SERVICE_EVENTARC;
        }
        return (_a = def.eventTrigger.service) !== null && _a !== void 0 ? _a : getServiceFromEventType(def.eventTrigger.eventType);
    }
    if (def.blockingTrigger) {
        return def.blockingTrigger.eventType;
    }
    if (def.httpsTrigger) {
        return "https";
    }
    if (def.taskQueueTrigger) {
        return constants_1.Constants.SERVICE_CLOUD_TASKS;
    }
    return "unknown";
}
exports.getFunctionService = getFunctionService;
/**
 * Returns a service ID to use for GCF 2nd gen events. Used to connect the right
 * emulator service.
 */
function getServiceFromEventType(eventType) {
    if (eventType.includes("firestore")) {
        return constants_1.Constants.SERVICE_FIRESTORE;
    }
    if (eventType.includes("database")) {
        return constants_1.Constants.SERVICE_REALTIME_DATABASE;
    }
    if (eventType.includes("pubsub")) {
        return constants_1.Constants.SERVICE_PUBSUB;
    }
    if (eventType.includes("storage")) {
        return constants_1.Constants.SERVICE_STORAGE;
    }
    if (eventType.includes("firebasealerts")) {
        return constants_1.Constants.SERVICE_FIREALERTS;
    }
    // Below this point are services that do not have a emulator.
    if (eventType.includes("analytics")) {
        return constants_1.Constants.SERVICE_ANALYTICS;
    }
    if (eventType.includes("auth")) {
        return constants_1.Constants.SERVICE_AUTH;
    }
    if (eventType.includes("crashlytics")) {
        return constants_1.Constants.SERVICE_CRASHLYTICS;
    }
    if (eventType.includes("remoteconfig")) {
        return constants_1.Constants.SERVICE_REMOTE_CONFIG;
    }
    if (eventType.includes("testing")) {
        return constants_1.Constants.SERVICE_TEST_LAB;
    }
    return "";
}
exports.getServiceFromEventType = getServiceFromEventType;
/**
 * Create a Promise which can be awaited to recieve request bodies as strings.
 */
function waitForBody(req) {
    let data = "";
    return new Promise((resolve) => {
        req.on("data", (chunk) => {
            data += chunk;
        });
        req.on("end", () => {
            resolve(data);
        });
    });
}
exports.waitForBody = waitForBody;
/**
 * Find the root directory housing a node module.
 */
function findModuleRoot(moduleName, filepath) {
    const hierarchy = filepath.split(path.sep);
    for (let i = 0; i < hierarchy.length; i++) {
        try {
            let chunks = [];
            if (i) {
                chunks = hierarchy.slice(0, -i);
            }
            else {
                chunks = hierarchy;
            }
            const packagePath = path.join(chunks.join(path.sep), "package.json");
            const serializedPackage = fs.readFileSync(packagePath, "utf8").toString();
            if (JSON.parse(serializedPackage).name === moduleName) {
                return chunks.join("/");
            }
            break;
        }
        catch (err) {
            /**/
        }
    }
    return "";
}
exports.findModuleRoot = findModuleRoot;
/**
 * Format a hostname for TCP dialing. Should only be used in Functions emulator.
 *
 * This is similar to EmulatorRegistry.url but with no explicit dependency on
 * the registry and so on and thus can work in functions shell.
 *
 * For any other part of the CLI, please use EmulatorRegistry.url(...).host
 * instead, which handles discovery, formatting, and fixing host in one go.
 */
function formatHost(info) {
    const host = (0, utils_1.connectableHostname)(info.host);
    if (host.includes(":")) {
        return `[${host}]:${info.port}`;
    }
    else {
        return `${host}:${info.port}`;
    }
}
exports.formatHost = formatHost;
/**
 * Determines the correct value for the environment variable that tells the
 * Functions Framework how to parse this functions' input.
 */
function getSignatureType(def) {
    if (def.httpsTrigger || def.blockingTrigger) {
        return "http";
    }
    if (def.platform === "gcfv2" && def.schedule) {
        return "http";
    }
    // TODO: As implemented, emulated CF3v1 functions cannot receive events in CloudEvent format, and emulated CF3v2
    // functions cannot receive events in legacy format. This conflicts with our goal of introducing a 'compat' layer
    // that allows CF3v1 functions to target GCFv2 and vice versa.
    return def.platform === "gcfv2" ? "cloudevent" : "event";
}
exports.getSignatureType = getSignatureType;
const LOCAL_SECRETS_FILE = ".secret.local";
/**
 * getSecretLocalPath returns the expected location for a .secret.local override file.
 */
function getSecretLocalPath(backend, projectDir) {
    const secretsFile = backend.extensionInstanceId
        ? `${backend.extensionInstanceId}${LOCAL_SECRETS_FILE}`
        : LOCAL_SECRETS_FILE;
    const secretDirectory = backend.extensionInstanceId
        ? path.join(projectDir, manifest_1.ENV_DIRECTORY)
        : backend.functionsDir;
    return path.join(secretDirectory, secretsFile);
}
exports.getSecretLocalPath = getSecretLocalPath;
/**
 * toBackendInfo transforms an EmulatableBackend into its correspondign API type, BackendInfo
 * @param e the emulatableBackend to transform
 * @param cf3Triggers a list of CF3 triggers. If e does not include predefinedTriggers, these will be used instead.
 */
function toBackendInfo(e, cf3Triggers, labels) {
    var _a, _b;
    const envWithSecrets = Object.assign({}, e.env);
    for (const s of e.secretEnv) {
        envWithSecrets[s.key] = backend.secretVersionName(s);
    }
    let extensionVersion = e.extensionVersion;
    if (extensionVersion) {
        extensionVersion = (0, extensionsHelper_1.substituteParams)(extensionVersion, e.env);
        if ((_a = extensionVersion.spec) === null || _a === void 0 ? void 0 : _a.postinstallContent) {
            extensionVersion.spec.postinstallContent = (0, postinstall_1.replaceConsoleLinks)(extensionVersion.spec.postinstallContent);
        }
    }
    let extensionSpec = e.extensionSpec;
    if (extensionSpec) {
        extensionSpec = (0, extensionsHelper_1.substituteParams)(extensionSpec, e.env);
        if (extensionSpec === null || extensionSpec === void 0 ? void 0 : extensionSpec.postinstallContent) {
            extensionSpec.postinstallContent = (0, postinstall_1.replaceConsoleLinks)(extensionSpec.postinstallContent);
        }
    }
    // Parse and stringify to get rid of undefined values
    return JSON.parse(JSON.stringify({
        directory: e.functionsDir,
        env: envWithSecrets,
        extensionInstanceId: e.extensionInstanceId,
        extension: e.extension,
        extensionVersion: extensionVersion,
        extensionSpec: extensionSpec,
        labels,
        functionTriggers: 
        // If we don't have predefinedTriggers, this is the CF3 backend.
        (_b = e.predefinedTriggers) !== null && _b !== void 0 ? _b : cf3Triggers.filter((t) => t.codebase === e.codebase),
    }));
}
exports.toBackendInfo = toBackendInfo;
