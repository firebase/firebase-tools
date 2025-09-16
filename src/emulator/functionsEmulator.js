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
exports.FunctionsEmulator = exports.TCPConn = exports.IPCConn = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const express = __importStar(require("express"));
const clc = __importStar(require("colorette"));
const http = __importStar(require("http"));
const jwt = __importStar(require("jsonwebtoken"));
const cors = __importStar(require("cors"));
const semver = __importStar(require("semver"));
const url_1 = require("url");
const events_1 = require("events");
const logger_1 = require("../logger");
const track_1 = require("../track");
const constants_1 = require("./constants");
const types_1 = require("./types");
const chokidar = __importStar(require("chokidar"));
const portfinder = __importStar(require("portfinder"));
const spawn = __importStar(require("cross-spawn"));
const functionsEmulatorShared_1 = require("./functionsEmulatorShared");
const registry_1 = require("./registry");
const emulatorLogger_1 = require("./emulatorLogger");
const functionsRuntimeWorker_1 = require("./functionsRuntimeWorker");
const error_1 = require("../error");
const workQueue_1 = require("./workQueue");
const utils_1 = require("../utils");
const adminSdkConfig_1 = require("./adminSdkConfig");
const validate_1 = require("../deploy/functions/validate");
const secretManager_1 = require("../gcp/secretManager");
const backend = __importStar(require("../deploy/functions/backend"));
const build = __importStar(require("../deploy/functions/build"));
const runtimes = __importStar(require("../deploy/functions/runtimes"));
const functionsEnv = __importStar(require("../functions/env"));
const v1_1 = require("../functions/events/v1");
const build_1 = require("../deploy/functions/build");
const env_1 = require("./env");
const python_1 = require("../functions/python");
const EVENT_INVOKE_GA4 = "functions_invoke"; // event name GA4 (alphanumertic)
/*
 * The Realtime Database emulator expects the `path` field in its trigger
 * definition to be relative to the database root. This regex is used to extract
 * that path from the `resource` member in the trigger definition used by the
 * functions emulator.
 *
 * Groups:
 *   1 - instance
 *   2 - path
 */
const DATABASE_PATH_PATTERN = new RegExp("^projects/[^/]+/instances/([^/]+)/refs(/.*)$");
/**
 * IPC connection info of a Function Runtime.
 */
class IPCConn {
    constructor(socketPath) {
        this.socketPath = socketPath;
    }
    httpReqOpts() {
        return {
            socketPath: this.socketPath,
        };
    }
}
exports.IPCConn = IPCConn;
/**
 * TCP/IP connection info of a Function Runtime.
 */
class TCPConn {
    constructor(host, port) {
        this.host = host;
        this.port = port;
    }
    httpReqOpts() {
        return {
            host: this.host,
            port: this.port,
        };
    }
}
exports.TCPConn = TCPConn;
class FunctionsEmulator {
    static getHttpFunctionUrl(projectId, name, region, info) {
        let url;
        if (info) {
            url = new url_1.URL("http://" + (0, functionsEmulatorShared_1.formatHost)(info));
        }
        else {
            url = registry_1.EmulatorRegistry.url(types_1.Emulators.FUNCTIONS);
        }
        url.pathname = `/${projectId}/${region}/${name}`;
        return url.toString();
    }
    constructor(args) {
        this.args = args;
        this.triggers = {};
        // Keep a "generation number" for triggers so that we can disable functions
        // and reload them with a new name.
        this.triggerGeneration = 0;
        this.logger = emulatorLogger_1.EmulatorLogger.forEmulator(types_1.Emulators.FUNCTIONS);
        this.multicastTriggers = {};
        this.blockingFunctionsConfig = {};
        this.staticBackends = [];
        this.dynamicBackends = [];
        this.watchers = [];
        this.debugMode = false;
        this.staticBackends = args.emulatableBackends;
        // TODO: Would prefer not to have static state but here we are!
        emulatorLogger_1.EmulatorLogger.setVerbosity(this.args.verbosity ? emulatorLogger_1.Verbosity[this.args.verbosity] : emulatorLogger_1.Verbosity["DEBUG"]);
        // When debugging is enabled, the "timeout" feature needs to be disabled so that
        // functions don't timeout while a breakpoint is active.
        if (this.args.debugPort) {
            // N.B. Technically this will create false positives where there is a Node
            // and a Python codebase, but there is no good place to check the runtime
            // because that may not be present until discovery (e.g. node codebases
            // return their runtime based on package.json if not specified in
            // firebase.json)
            const maybeNodeCodebases = this.staticBackends.filter((b) => !b.runtime || b.runtime.startsWith("node"));
            if (maybeNodeCodebases.length > 1 && typeof this.args.debugPort === "number") {
                throw new error_1.FirebaseError("Cannot debug on a single port with multiple codebases. " +
                    "Use --inspect-functions=true to assign dynamic ports to each codebase");
            }
            this.args.disabledRuntimeFeatures = this.args.disabledRuntimeFeatures || {};
            this.args.disabledRuntimeFeatures.timeout = true;
            this.debugMode = true;
        }
        this.adminSdkConfig = { ...this.args.adminSdkConfig, projectId: this.args.projectId };
        const mode = this.debugMode ? types_1.FunctionsExecutionMode.SEQUENTIAL : types_1.FunctionsExecutionMode.AUTO;
        this.workerPools = {};
        for (const backend of this.staticBackends) {
            const pool = new functionsRuntimeWorker_1.RuntimeWorkerPool(mode);
            this.workerPools[backend.codebase] = pool;
        }
        this.workQueue = new workQueue_1.WorkQueue(mode);
    }
    async loadDynamicExtensionBackends() {
        // New extensions defined in functions codebase create new backends
        if (this.args.extensionsEmulator) {
            const unfilteredBackends = this.args.extensionsEmulator.getDynamicExtensionBackends();
            this.dynamicBackends =
                this.args.extensionsEmulator.filterUnemulatedTriggers(unfilteredBackends);
            const mode = this.debugMode ? types_1.FunctionsExecutionMode.SEQUENTIAL : types_1.FunctionsExecutionMode.AUTO;
            const credentialEnv = await (0, env_1.getCredentialsEnvironment)(this.args.account, this.logger, "functions");
            for (const backend of this.dynamicBackends) {
                backend.env = { ...credentialEnv, ...backend.env };
                if (this.workerPools[backend.codebase]) {
                    // Make sure we don't have stale workers.
                    if (this.debugMode) {
                        this.workerPools[backend.codebase].exit();
                    }
                    else {
                        this.workerPools[backend.codebase].refresh();
                    }
                }
                else {
                    const pool = new functionsRuntimeWorker_1.RuntimeWorkerPool(mode);
                    this.workerPools[backend.codebase] = pool;
                }
                // They need to be force loaded because otherwise
                // changes in parameters that don't otherwise affect the
                // trigger might be missed.
                await this.loadTriggers(backend, /* force */ true);
            }
        }
    }
    createHubServer() {
        // TODO(samstern): Should not need this here but some tests are directly calling this method
        // because FunctionsEmulator.start() used to not be test safe.
        this.workQueue.start();
        const hub = express();
        const dataMiddleware = (req, res, next) => {
            const chunks = [];
            req.on("data", (chunk) => {
                chunks.push(chunk);
            });
            req.on("end", () => {
                req.rawBody = Buffer.concat(chunks);
                next();
            });
        };
        // The URL for the function that the other emulators (Firestore, etc) use.
        // TODO(abehaskins): Make the other emulators use the route below and remove this.
        const backgroundFunctionRoute = `/functions/projects/:project_id/triggers/:trigger_name(*)`;
        // The URL that the developer sees, this is the same URL that the legacy emulator used.
        const httpsFunctionRoute = `/${this.args.projectId}/:region/:trigger_name`;
        // The URL for events meant to trigger multiple functions
        const multicastFunctionRoute = `/functions/projects/:project_id/trigger_multicast`;
        // A trigger named "foo" needs to respond at "foo" as well as "foo/*" but not "fooBar".
        const httpsFunctionRoutes = [httpsFunctionRoute, `${httpsFunctionRoute}/*`];
        // The URL for the listBackends endpoint, which is used by the Emulator UI.
        const listBackendsRoute = `/backends`;
        const httpsHandler = (req, res) => {
            const work = () => {
                return this.handleHttpsTrigger(req, res);
            };
            work.type = `${req.path}-${new Date().toISOString()}`;
            this.workQueue.submit(work);
        };
        const multicastHandler = (req, res) => {
            const projectId = req.params.project_id;
            const rawBody = req.rawBody;
            const event = JSON.parse(rawBody.toString());
            let triggerKey;
            if (req.headers["content-type"]?.includes("cloudevent")) {
                triggerKey = `${this.args.projectId}:${event.type}`;
            }
            else {
                triggerKey = `${this.args.projectId}:${event.eventType}`;
            }
            if (event.data.bucket) {
                triggerKey += `:${event.data.bucket}`;
            }
            const triggers = this.multicastTriggers[triggerKey] || [];
            const { host, port } = this.getInfo();
            triggers.forEach((triggerId) => {
                const work = () => {
                    return new Promise((resolve, reject) => {
                        const trigReq = http.request({
                            host: (0, utils_1.connectableHostname)(host),
                            port,
                            method: req.method,
                            path: `/functions/projects/${projectId}/triggers/${triggerId}`,
                            headers: req.headers,
                        });
                        trigReq.on("error", reject);
                        trigReq.write(rawBody);
                        trigReq.end();
                        resolve();
                    });
                };
                work.type = `${triggerId}-${new Date().toISOString()}`;
                this.workQueue.submit(work);
            });
            res.json({ status: "multicast_acknowledged" });
        };
        const listBackendsHandler = (req, res) => {
            res.json({ backends: this.getBackendInfo() });
        };
        // The ordering here is important. The longer routes (background)
        // need to be registered first otherwise the HTTP functions consume
        // all events.
        hub.get(listBackendsRoute, cors({ origin: true }), listBackendsHandler); // This route needs CORS so the Emulator UI can call it.
        hub.post(backgroundFunctionRoute, dataMiddleware, httpsHandler);
        hub.post(multicastFunctionRoute, dataMiddleware, multicastHandler);
        hub.all(httpsFunctionRoutes, dataMiddleware, httpsHandler);
        hub.all("*", dataMiddleware, (req, res) => {
            logger_1.logger.debug(`Functions emulator received unknown request at path ${req.path}`);
            res.sendStatus(404);
        });
        return hub;
    }
    async sendRequest(trigger, body) {
        const record = this.getTriggerRecordByKey(this.getTriggerKey(trigger));
        const pool = this.workerPools[record.backend.codebase];
        if (!pool.readyForWork(trigger.id)) {
            try {
                await this.startRuntime(record.backend, trigger);
            }
            catch (e) {
                this.logger.logLabeled("ERROR", `Failed to start runtime for ${trigger.id}: ${e}`);
                return;
            }
        }
        const worker = pool.getIdleWorker(trigger.id);
        if (this.debugMode) {
            await worker.sendDebugMsg({
                functionTarget: trigger.entryPoint,
                functionSignature: (0, functionsEmulatorShared_1.getSignatureType)(trigger),
            });
        }
        const reqBody = JSON.stringify(body);
        const headers = {
            "Content-Type": "application/json",
            "Content-Length": `${reqBody.length}`,
        };
        return new Promise((resolve, reject) => {
            const req = http.request({
                ...worker.runtime.conn.httpReqOpts(),
                path: `/`,
                headers: headers,
            }, resolve);
            req.on("error", reject);
            req.write(reqBody);
            req.end();
        });
    }
    async start() {
        const credentialEnv = await (0, env_1.getCredentialsEnvironment)(this.args.account, this.logger, "functions");
        for (const e of this.staticBackends) {
            e.env = { ...credentialEnv, ...e.env };
        }
        if (Object.keys(this.adminSdkConfig || {}).length <= 1) {
            const adminSdkConfig = await (0, adminSdkConfig_1.getProjectAdminSdkConfigOrCached)(this.args.projectId);
            if (adminSdkConfig) {
                this.adminSdkConfig = adminSdkConfig;
            }
            else {
                this.logger.logLabeled("WARN", "functions", "Unable to fetch project Admin SDK configuration, Admin SDK behavior in Cloud Functions emulator may be incorrect.");
                this.adminSdkConfig = (0, adminSdkConfig_1.constructDefaultAdminSdkConfig)(this.args.projectId);
            }
        }
        const { host, port } = this.getInfo();
        this.workQueue.start();
        const server = this.createHubServer().listen(port, host);
        this.destroyServer = (0, utils_1.createDestroyer)(server);
        return Promise.resolve();
    }
    async connect() {
        for (const backend of this.staticBackends) {
            this.logger.logLabeled("BULLET", "functions", `Watching "${backend.functionsDir}" for Cloud Functions...`);
            const watcher = chokidar.watch(backend.functionsDir, {
                ignored: [
                    /.+?[\\\/]node_modules[\\\/].+?/,
                    /(^|[\/\\])\../,
                    /.+\.log/,
                    /.+?[\\\/]venv[\\\/].+?/,
                    ...(backend.ignore?.map((i) => `**/${i}`) ?? []),
                ],
                persistent: true,
            });
            this.watchers.push(watcher);
            const debouncedLoadTriggers = (0, utils_1.debounce)(() => this.loadTriggers(backend), 1000);
            watcher.on("change", (filePath) => {
                this.logger.log("DEBUG", `File ${filePath} changed, reloading triggers`);
                return debouncedLoadTriggers();
            });
            await this.loadTriggers(backend, /* force= */ true);
        }
        await this.performPostLoadOperations();
        return;
    }
    async stop() {
        try {
            await this.workQueue.flush();
        }
        catch (e) {
            this.logger.logLabeled("WARN", "functions", "Functions emulator work queue did not empty before stopping");
        }
        this.workQueue.stop();
        for (const pool of Object.values(this.workerPools)) {
            pool.exit();
        }
        for (const watcher of this.watchers) {
            await watcher.close();
        }
        this.watchers = [];
        if (this.destroyServer) {
            await this.destroyServer();
        }
    }
    async discoverTriggers(emulatableBackend) {
        if (emulatableBackend.predefinedTriggers) {
            return (0, functionsEmulatorShared_1.emulatedFunctionsByRegion)(emulatableBackend.predefinedTriggers, emulatableBackend.secretEnv);
        }
        else {
            const runtimeConfig = this.getRuntimeConfig(emulatableBackend);
            const runtimeDelegateContext = {
                projectId: this.args.projectId,
                projectDir: this.args.projectDir,
                sourceDir: emulatableBackend.functionsDir,
                runtime: emulatableBackend.runtime,
            };
            const runtimeDelegate = await runtimes.getRuntimeDelegate(runtimeDelegateContext);
            logger_1.logger.debug(`Validating ${runtimeDelegate.language} source`);
            await runtimeDelegate.validate();
            logger_1.logger.debug(`Building ${runtimeDelegate.language} source`);
            await runtimeDelegate.build();
            // Retrieve information from the runtime delegate.
            emulatableBackend.runtime = runtimeDelegate.runtime;
            emulatableBackend.bin = runtimeDelegate.bin;
            // Don't include user envs when parsing triggers. Do include user envs when resolving parameter values
            const firebaseConfig = this.getFirebaseConfig();
            const environment = {
                ...this.getSystemEnvs(),
                ...this.getEmulatorEnvs(),
                FIREBASE_CONFIG: firebaseConfig,
                ...emulatableBackend.env,
            };
            const userEnvOpt = {
                functionsSource: emulatableBackend.functionsDir,
                projectId: this.args.projectId,
                projectAlias: this.args.projectAlias,
                isEmulator: true,
                configDir: emulatableBackend.configDir,
            };
            const userEnvs = functionsEnv.loadUserEnvs(userEnvOpt);
            const discoveredBuild = await runtimeDelegate.discoverBuild(runtimeConfig, environment);
            if (discoveredBuild.extensions && this.args.extensionsEmulator) {
                await this.args.extensionsEmulator.addDynamicExtensions(emulatableBackend.codebase, discoveredBuild);
                await this.loadDynamicExtensionBackends();
            }
            build.applyPrefix(discoveredBuild, emulatableBackend.prefix || "");
            const resolution = await (0, build_1.resolveBackend)({
                build: discoveredBuild,
                firebaseConfig: JSON.parse(firebaseConfig),
                userEnvs,
                nonInteractive: false,
                isEmulator: true,
            });
            functionsEnv.writeResolvedParams(resolution.envs, userEnvs, userEnvOpt);
            const discoveredBackend = resolution.backend;
            const endpoints = backend.allEndpoints(discoveredBackend);
            (0, functionsEmulatorShared_1.prepareEndpoints)(endpoints);
            for (const e of endpoints) {
                e.codebase = emulatableBackend.codebase;
            }
            return (0, functionsEmulatorShared_1.emulatedFunctionsFromEndpoints)(endpoints);
        }
    }
    /**
     * When a user changes their code, we need to look for triggers defined in their updates sources.
     *
     * TODO(b/216167890): Gracefully handle removal of deleted function definitions
     */
    async loadTriggers(emulatableBackend, force = false) {
        let triggerDefinitions = [];
        try {
            triggerDefinitions = await this.discoverTriggers(emulatableBackend);
            this.logger.logLabeled("SUCCESS", "functions", `Loaded functions definitions from source: ${triggerDefinitions
                .map((t) => t.entryPoint)
                .join(", ")}.`);
        }
        catch (e) {
            this.logger.logLabeled("ERROR", "functions", `Failed to load function definition from source: ${e}`);
            return;
        }
        // Before loading any triggers we need to make sure there are no 'stale' workers
        // in the pool that would cause us to run old code.
        if (this.debugMode) {
            // Kill the workerPool. This should clean up all inspectors connected to the debug port.
            this.workerPools[emulatableBackend.codebase].exit();
        }
        else {
            this.workerPools[emulatableBackend.codebase].refresh();
        }
        // Remove any old trigger definitions
        const toRemove = Object.keys(this.triggers).filter((recordKey) => {
            const record = this.getTriggerRecordByKey(recordKey);
            if (record.backend.codebase !== emulatableBackend.codebase) {
                // Order is important here. This needs to go before any other checks.
                // We are only loading one codebase, don't delete triggers from another.
                return false;
            }
            if (force) {
                return true; // We are going to load all of the triggers anyway, so we can remove everything
            }
            return !triggerDefinitions.some((def) => record.def.entryPoint === def.entryPoint &&
                JSON.stringify(record.def.eventTrigger) === JSON.stringify(def.eventTrigger));
        });
        await this.removeTriggers(toRemove);
        // When force is true we set up all triggers, otherwise we only set up
        // triggers which have a unique function name
        const toSetup = triggerDefinitions.filter((definition) => {
            if (force) {
                return true;
            }
            // We want to add a trigger if we don't already have an enabled trigger
            // with the same entryPoint / trigger.
            const anyEnabledMatch = Object.values(this.triggers).some((record) => {
                const sameEntryPoint = record.def.entryPoint === definition.entryPoint;
                // If they both have event triggers, make sure they match
                const sameEventTrigger = JSON.stringify(record.def.eventTrigger) === JSON.stringify(definition.eventTrigger);
                if (sameEntryPoint && !sameEventTrigger) {
                    this.logger.log("DEBUG", `Definition for trigger ${definition.entryPoint} changed from ${JSON.stringify(record.def.eventTrigger)} to ${JSON.stringify(definition.eventTrigger)}`);
                }
                return record.enabled && sameEntryPoint && sameEventTrigger;
            });
            return !anyEnabledMatch;
        });
        for (const definition of toSetup) {
            // Skip function with invalid id.
            try {
                // Note - in the emulator, functionId = {region}-{functionName}, but in prod, functionId=functionName.
                // To match prod behavior, only validate functionName
                (0, validate_1.functionIdsAreValid)([{ ...definition, id: definition.name }]);
            }
            catch (e) {
                throw new error_1.FirebaseError(`functions[${definition.id}]: Invalid function id: ${e.message}`);
            }
            let added = false;
            let url = undefined;
            if (definition.httpsTrigger) {
                added = true;
                url = FunctionsEmulator.getHttpFunctionUrl(this.args.projectId, definition.name, definition.region);
                if (definition.taskQueueTrigger) {
                    added = await this.addTaskQueueTrigger(this.args.projectId, definition.region, definition.name, url, definition.taskQueueTrigger);
                }
            }
            else if (definition.eventTrigger) {
                const service = (0, functionsEmulatorShared_1.getFunctionService)(definition);
                const key = this.getTriggerKey(definition);
                const signature = (0, functionsEmulatorShared_1.getSignatureType)(definition);
                switch (service) {
                    case constants_1.Constants.SERVICE_FIRESTORE:
                        added = await this.addFirestoreTrigger(this.args.projectId, key, definition.eventTrigger, signature);
                        break;
                    case constants_1.Constants.SERVICE_REALTIME_DATABASE:
                        added = await this.addRealtimeDatabaseTrigger(this.args.projectId, definition.id, key, definition.eventTrigger, signature, definition.region);
                        break;
                    case constants_1.Constants.SERVICE_PUBSUB:
                        added = await this.addPubsubTrigger(definition.name, key, definition.eventTrigger, signature, definition.schedule);
                        break;
                    case constants_1.Constants.SERVICE_EVENTARC:
                        added = await this.addEventarcTrigger(this.args.projectId, key, definition.eventTrigger);
                        break;
                    case constants_1.Constants.SERVICE_AUTH:
                        added = this.addAuthTrigger(this.args.projectId, key, definition.eventTrigger);
                        break;
                    case constants_1.Constants.SERVICE_STORAGE:
                        added = this.addStorageTrigger(this.args.projectId, key, definition.eventTrigger);
                        break;
                    case constants_1.Constants.SERVICE_FIREALERTS:
                        added = await this.addFirealertsTrigger(this.args.projectId, key, definition.eventTrigger);
                        break;
                    default:
                        this.logger.log("DEBUG", `Unsupported trigger: ${JSON.stringify(definition)}`);
                        break;
                }
            }
            else if (definition.blockingTrigger) {
                url = FunctionsEmulator.getHttpFunctionUrl(this.args.projectId, definition.name, definition.region);
                added = this.addBlockingTrigger(url, definition.blockingTrigger);
            }
            else {
                this.logger.log("WARN", `Unsupported function type on ${definition.name}. Expected either an httpsTrigger, eventTrigger, or blockingTrigger.`);
            }
            const ignored = !added;
            this.addTriggerRecord(definition, { backend: emulatableBackend, ignored, url });
            const triggerType = definition.httpsTrigger
                ? "http"
                : constants_1.Constants.getServiceName((0, functionsEmulatorShared_1.getFunctionService)(definition));
            if (ignored) {
                const msg = `function ignored because the ${triggerType} emulator does not exist or is not running.`;
                this.logger.logLabeled("BULLET", `functions[${definition.id}]`, msg);
            }
            else {
                const msg = url
                    ? `${clc.bold(triggerType)} function initialized (${url}).`
                    : `${clc.bold(triggerType)} function initialized.`;
                this.logger.logLabeled("SUCCESS", `functions[${definition.id}]`, msg);
            }
        }
        // In debug mode, we eagerly start the runtime processes to allow debuggers to attach
        // before invoking a function.
        if (this.debugMode) {
            if (!emulatableBackend.runtime?.startsWith("node")) {
                this.logger.log("WARN", "--inspect-functions only supported for Node.js runtimes.");
            }
            else {
                // Since we're about to start a runtime to be shared by all the functions in this codebase,
                // we need to make sure it has all the secrets used by any function in the codebase.
                emulatableBackend.secretEnv = Object.values(triggerDefinitions.reduce((acc, curr) => {
                    for (const secret of curr.secretEnvironmentVariables || []) {
                        acc[secret.key] = secret;
                    }
                    return acc;
                }, {}));
                try {
                    await this.startRuntime(emulatableBackend);
                }
                catch (e) {
                    this.logger.logLabeled("ERROR", `Failed to start functions in ${emulatableBackend.functionsDir}: ${e}`);
                }
            }
        }
    }
    // Currently only cleans up eventarc and firealerts triggers
    async removeTriggers(toRemove) {
        for (const triggerKey of toRemove) {
            const definition = this.triggers[triggerKey].def;
            const service = (0, functionsEmulatorShared_1.getFunctionService)(definition);
            const key = this.getTriggerKey(definition);
            switch (service) {
                case constants_1.Constants.SERVICE_EVENTARC:
                    await this.removeEventarcTrigger(this.args.projectId, key, definition.eventTrigger);
                    delete this.triggers[key];
                    break;
                case constants_1.Constants.SERVICE_FIREALERTS:
                    await this.removeFirealertsTrigger(this.args.projectId, key, definition.eventTrigger);
                    delete this.triggers[key];
                    break;
                default:
                    break;
            }
        }
    }
    async addEventarcTrigger(projectId, key, eventTrigger) {
        if (!registry_1.EmulatorRegistry.isRunning(types_1.Emulators.EVENTARC)) {
            return false;
        }
        const bundle = {
            eventTrigger: {
                ...eventTrigger,
                service: "eventarc.googleapis.com",
            },
        };
        logger_1.logger.debug(`addEventarcTrigger`, JSON.stringify(bundle));
        try {
            await registry_1.EmulatorRegistry.client(types_1.Emulators.EVENTARC).post(`/emulator/v1/projects/${projectId}/triggers/${key}`, bundle);
            return true;
        }
        catch (err) {
            this.logger.log("WARN", "Error adding Eventarc function: " + err);
        }
        return false;
    }
    async removeEventarcTrigger(projectId, key, eventTrigger) {
        if (!registry_1.EmulatorRegistry.isRunning(types_1.Emulators.EVENTARC)) {
            return Promise.resolve(false);
        }
        const bundle = {
            eventTrigger: {
                ...eventTrigger,
                service: "eventarc.googleapis.com",
            },
        };
        logger_1.logger.debug(`removeEventarcTrigger`, JSON.stringify(bundle));
        try {
            await registry_1.EmulatorRegistry.client(types_1.Emulators.EVENTARC).post(`/emulator/v1/remove/projects/${projectId}/triggers/${key}`, bundle);
            return true;
        }
        catch (err) {
            this.logger.log("WARN", "Error removing Eventarc function: " + err);
        }
        return false;
    }
    async addFirealertsTrigger(projectId, key, eventTrigger) {
        if (!registry_1.EmulatorRegistry.isRunning(types_1.Emulators.EVENTARC)) {
            return false;
        }
        const bundle = {
            eventTrigger: {
                ...eventTrigger,
                service: "firebasealerts.googleapis.com",
            },
        };
        logger_1.logger.debug(`addFirealertsTrigger`, JSON.stringify(bundle));
        try {
            await registry_1.EmulatorRegistry.client(types_1.Emulators.EVENTARC).post(`/emulator/v1/projects/${projectId}/triggers/${key}`, bundle);
            return true;
        }
        catch (err) {
            this.logger.log("WARN", "Error adding FireAlerts function: " + err);
        }
        return false;
    }
    async removeFirealertsTrigger(projectId, key, eventTrigger) {
        if (!registry_1.EmulatorRegistry.isRunning(types_1.Emulators.EVENTARC)) {
            return false;
        }
        const bundle = {
            eventTrigger: {
                ...eventTrigger,
                service: "firebasealerts.googleapis.com",
            },
        };
        logger_1.logger.debug(`removeFirealertsTrigger`, JSON.stringify(bundle));
        try {
            await registry_1.EmulatorRegistry.client(types_1.Emulators.EVENTARC).post(`/emulator/v1/remove/projects/${projectId}/triggers/${key}`, bundle);
            return true;
        }
        catch (err) {
            this.logger.log("WARN", "Error removing FireAlerts function: " + err);
        }
        return false;
    }
    async performPostLoadOperations() {
        if (!this.blockingFunctionsConfig.triggers &&
            !this.blockingFunctionsConfig.forwardInboundCredentials) {
            return;
        }
        if (!registry_1.EmulatorRegistry.isRunning(types_1.Emulators.AUTH)) {
            return;
        }
        const path = `/identitytoolkit.googleapis.com/v2/projects/${this.getProjectId()}/config?updateMask=blockingFunctions`;
        try {
            const client = registry_1.EmulatorRegistry.client(types_1.Emulators.AUTH);
            await client.patch(path, { blockingFunctions: this.blockingFunctionsConfig }, {
                headers: { Authorization: "Bearer owner" },
            });
        }
        catch (err) {
            this.logger.log("WARN", "Error updating blocking functions config to the auth emulator: " + err);
            throw err;
        }
    }
    getV1DatabaseApiAttributes(projectId, key, eventTrigger) {
        const result = DATABASE_PATH_PATTERN.exec(eventTrigger.resource);
        if (result === null || result.length !== 3) {
            this.logger.log("WARN", `Event function "${key}" has malformed "resource" member. ` + `${eventTrigger.resource}`);
            throw new error_1.FirebaseError(`Event function ${key} has malformed resource member`);
        }
        const instance = result[1];
        const bundle = JSON.stringify({
            name: `projects/${projectId}/locations/_/functions/${key}`,
            path: result[2],
            event: eventTrigger.eventType,
            topic: `projects/${projectId}/topics/${key}`,
        });
        let apiPath = "/.settings/functionTriggers.json";
        if (instance !== "") {
            apiPath += `?ns=${instance}`;
        }
        else {
            this.logger.log("WARN", `No project in use. Registering function for sentinel namespace '${constants_1.Constants.DEFAULT_DATABASE_EMULATOR_NAMESPACE}'`);
        }
        return { bundle, apiPath, instance };
    }
    getV2DatabaseApiAttributes(projectId, id, key, eventTrigger, region) {
        const instance = eventTrigger.eventFilters?.instance || eventTrigger.eventFilterPathPatterns?.instance;
        if (!instance) {
            throw new error_1.FirebaseError("A database instance must be supplied.");
        }
        const ref = eventTrigger.eventFilterPathPatterns?.ref;
        if (!ref) {
            throw new error_1.FirebaseError("A database reference must be supplied.");
        }
        // TODO(colerogers): yank/change if RTDB emulator ever supports multiple regions
        if (region !== "us-central1") {
            this.logger.logLabeled("WARN", `functions[${id}]`, `function region is defined outside the database region, will not trigger.`);
        }
        // The 'namespacePattern' determines that we are using the v2 interface
        const bundle = JSON.stringify({
            name: `projects/${projectId}/locations/${region}/triggers/${key}`,
            path: ref,
            event: eventTrigger.eventType,
            topic: `projects/${projectId}/topics/${key}`,
            namespacePattern: instance,
        });
        // The query parameter '?ns=${instance}' is ignored in v2
        const apiPath = "/.settings/functionTriggers.json";
        return { bundle, apiPath, instance };
    }
    async addRealtimeDatabaseTrigger(projectId, id, key, eventTrigger, signature, region) {
        if (!registry_1.EmulatorRegistry.isRunning(types_1.Emulators.DATABASE)) {
            return false;
        }
        const { bundle, apiPath, instance } = signature === "cloudevent"
            ? this.getV2DatabaseApiAttributes(projectId, id, key, eventTrigger, region)
            : this.getV1DatabaseApiAttributes(projectId, key, eventTrigger);
        logger_1.logger.debug(`addRealtimeDatabaseTrigger[${instance}]`, JSON.stringify(bundle));
        const client = registry_1.EmulatorRegistry.client(types_1.Emulators.DATABASE);
        try {
            await client.post(apiPath, bundle, { headers: { Authorization: "Bearer owner" } });
        }
        catch (err) {
            this.logger.log("WARN", "Error adding Realtime Database function: " + err);
            throw err;
        }
        return true;
    }
    getV1FirestoreAttributes(projectId, key, eventTrigger) {
        const bundle = JSON.stringify({
            eventTrigger: {
                ...eventTrigger,
                service: "firestore.googleapis.com",
            },
        });
        const path = `/emulator/v1/projects/${projectId}/triggers/${key}`;
        return { bundle, path };
    }
    getV2FirestoreAttributes(projectId, key, eventTrigger) {
        logger_1.logger.debug("Found a v2 firestore trigger.");
        const database = eventTrigger.eventFilters?.database;
        if (!database) {
            throw new error_1.FirebaseError(`A database must be supplied for event trigger ${key}`);
        }
        const namespace = eventTrigger.eventFilters?.namespace;
        if (!namespace) {
            throw new error_1.FirebaseError(`A namespace must be supplied for event trigger ${key}`);
        }
        let doc;
        let match;
        if (eventTrigger.eventFilters?.document) {
            doc = eventTrigger.eventFilters?.document;
            match = "EXACT";
        }
        if (eventTrigger.eventFilterPathPatterns?.document) {
            doc = eventTrigger.eventFilterPathPatterns?.document;
            match = "PATH_PATTERN";
        }
        if (!doc) {
            throw new error_1.FirebaseError("A document must be supplied.");
        }
        const bundle = JSON.stringify({
            eventType: eventTrigger.eventType,
            database,
            namespace,
            document: {
                value: doc,
                matchType: match,
            },
        });
        const path = `/emulator/v1/projects/${projectId}/eventarcTrigger?eventarcTriggerId=${key}`;
        return { bundle, path };
    }
    async addFirestoreTrigger(projectId, key, eventTrigger, signature) {
        if (!registry_1.EmulatorRegistry.isRunning(types_1.Emulators.FIRESTORE)) {
            return Promise.resolve(false);
        }
        const { bundle, path } = signature === "cloudevent"
            ? this.getV2FirestoreAttributes(projectId, key, eventTrigger)
            : this.getV1FirestoreAttributes(projectId, key, eventTrigger);
        logger_1.logger.debug(`addFirestoreTrigger`, JSON.stringify(bundle));
        const client = registry_1.EmulatorRegistry.client(types_1.Emulators.FIRESTORE);
        try {
            signature === "cloudevent" ? await client.post(path, bundle) : await client.put(path, bundle);
        }
        catch (err) {
            this.logger.log("WARN", "Error adding firestore function: " + err);
            throw err;
        }
        return true;
    }
    async addPubsubTrigger(triggerName, key, eventTrigger, signatureType, schedule) {
        const pubsubEmulator = registry_1.EmulatorRegistry.get(types_1.Emulators.PUBSUB);
        if (!pubsubEmulator) {
            return false;
        }
        logger_1.logger.debug(`addPubsubTrigger`, JSON.stringify({ eventTrigger }));
        // "resource":\"projects/{PROJECT_ID}/topics/{TOPIC_ID}";
        const resource = eventTrigger.resource;
        let topic;
        if (schedule) {
            // In production this topic looks like
            // "firebase-schedule-{FUNCTION_NAME}-{DEPLOY-LOCATION}", we simply drop
            // the deploy location to match as closely as possible.
            topic = "firebase-schedule-" + triggerName;
        }
        else {
            const resourceParts = resource.split("/");
            topic = resourceParts[resourceParts.length - 1];
        }
        try {
            await pubsubEmulator.addTrigger(topic, key, signatureType);
            return true;
        }
        catch (e) {
            return false;
        }
    }
    addAuthTrigger(projectId, key, eventTrigger) {
        logger_1.logger.debug(`addAuthTrigger`, JSON.stringify({ eventTrigger }));
        const eventTriggerId = `${projectId}:${eventTrigger.eventType}`;
        const triggers = this.multicastTriggers[eventTriggerId] || [];
        triggers.push(key);
        this.multicastTriggers[eventTriggerId] = triggers;
        return true;
    }
    addStorageTrigger(projectId, key, eventTrigger) {
        logger_1.logger.debug(`addStorageTrigger`, JSON.stringify({ eventTrigger }));
        const bucket = eventTrigger.resource.startsWith("projects/_/buckets/")
            ? eventTrigger.resource.split("/")[3]
            : eventTrigger.resource;
        const eventTriggerId = `${projectId}:${eventTrigger.eventType}:${bucket}`;
        const triggers = this.multicastTriggers[eventTriggerId] || [];
        triggers.push(key);
        this.multicastTriggers[eventTriggerId] = triggers;
        return true;
    }
    addBlockingTrigger(url, blockingTrigger) {
        logger_1.logger.debug(`addBlockingTrigger`, JSON.stringify({ blockingTrigger }));
        const eventType = blockingTrigger.eventType;
        if (!v1_1.AUTH_BLOCKING_EVENTS.includes(eventType)) {
            return false;
        }
        if (blockingTrigger.eventType === v1_1.BEFORE_CREATE_EVENT) {
            this.blockingFunctionsConfig.triggers = {
                ...this.blockingFunctionsConfig.triggers,
                beforeCreate: {
                    functionUri: url,
                },
            };
        }
        else {
            this.blockingFunctionsConfig.triggers = {
                ...this.blockingFunctionsConfig.triggers,
                beforeSignIn: {
                    functionUri: url,
                },
            };
        }
        this.blockingFunctionsConfig.forwardInboundCredentials = {
            accessToken: !!blockingTrigger.options.accessToken,
            idToken: !!blockingTrigger.options.idToken,
            refreshToken: !!blockingTrigger.options.refreshToken,
        };
        return true;
    }
    async addTaskQueueTrigger(projectId, location, entryPoint, defaultUri, taskQueueTrigger) {
        logger_1.logger.debug(`addTaskQueueTrigger`, JSON.stringify(taskQueueTrigger));
        if (!registry_1.EmulatorRegistry.isRunning(types_1.Emulators.TASKS)) {
            logger_1.logger.debug(`addTaskQueueTrigger`, "TQ not running");
            return Promise.resolve(false);
        }
        const bundle = {
            ...taskQueueTrigger,
            defaultUri,
        };
        try {
            await registry_1.EmulatorRegistry.client(types_1.Emulators.TASKS).post(`/projects/${projectId}/locations/${location}/queues/${entryPoint}`, bundle);
            return true;
        }
        catch (err) {
            this.logger.log("WARN", "Error adding Task Queue function: " + err);
            return false;
        }
    }
    getProjectId() {
        return this.args.projectId;
    }
    getInfo() {
        const host = this.args.host || constants_1.Constants.getDefaultHost();
        const port = this.args.port || constants_1.Constants.getDefaultPort(types_1.Emulators.FUNCTIONS);
        return {
            name: this.getName(),
            host,
            port,
        };
    }
    getName() {
        return types_1.Emulators.FUNCTIONS;
    }
    getTriggerDefinitions() {
        return Object.values(this.triggers).map((record) => record.def);
    }
    getTriggerRecordByKey(triggerKey) {
        const record = this.triggers[triggerKey];
        if (!record) {
            logger_1.logger.debug(`Could not find key=${triggerKey} in ${JSON.stringify(this.triggers)}`);
            throw new error_1.FirebaseError(`No function with key ${triggerKey}`);
        }
        return record;
    }
    getTriggerKey(def) {
        // For background triggers we attach the current generation as a suffix
        if (def.eventTrigger) {
            const triggerKey = `${def.id}-${this.triggerGeneration}`;
            return def.eventTrigger.channel ? `${triggerKey}-${def.eventTrigger.channel}` : triggerKey;
        }
        else {
            return def.id;
        }
    }
    getBackendInfo() {
        const cf3Triggers = this.getCF3Triggers();
        const backendInfo = this.staticBackends.map((e) => {
            return (0, functionsEmulatorShared_1.toBackendInfo)(e, cf3Triggers);
        });
        const dynamicInfo = this.dynamicBackends.map((e) => {
            return (0, functionsEmulatorShared_1.toBackendInfo)(e, cf3Triggers, { createdBy: "SDK" });
        });
        backendInfo.push(...dynamicInfo);
        return backendInfo;
    }
    getCF3Triggers() {
        return Object.values(this.triggers)
            .filter((t) => !t.backend.extensionInstanceId)
            .map((t) => t.def);
    }
    addTriggerRecord(def, opts) {
        const key = this.getTriggerKey(def);
        this.triggers[key] = {
            def,
            enabled: true,
            backend: opts.backend,
            ignored: opts.ignored,
            url: opts.url,
        };
    }
    setTriggersForTesting(triggers, backend) {
        this.triggers = {};
        triggers.forEach((def) => this.addTriggerRecord(def, { backend, ignored: false }));
    }
    getRuntimeConfig(backend) {
        const configPath = `${backend.functionsDir}/.runtimeconfig.json`;
        try {
            const configContent = fs.readFileSync(configPath, "utf8");
            return JSON.parse(configContent.toString());
        }
        catch (e) {
            // This is fine - runtime config is optional.
        }
        return {};
    }
    getUserEnvs(backend) {
        const projectInfo = {
            functionsSource: backend.functionsDir,
            configDir: backend.configDir,
            projectId: this.args.projectId,
            projectAlias: this.args.projectAlias,
            isEmulator: true,
        };
        if (functionsEnv.hasUserEnvs(projectInfo)) {
            try {
                return functionsEnv.loadUserEnvs(projectInfo);
            }
            catch (e) {
                // Ignore - user envs are optional.
                logger_1.logger.debug("Failed to load local environment variables", e);
            }
        }
        return {};
    }
    getSystemEnvs(trigger) {
        const envs = {};
        // Env vars guaranteed by GCF platform.
        //   https://cloud.google.com/functions/docs/env-var
        envs.GCLOUD_PROJECT = this.args.projectId;
        envs.K_REVISION = "1";
        envs.PORT = "80";
        // Quota project is required when using GCP's Client-based APIs.
        // Some GCP client SDKs, like Vertex AI, requires appropriate quota project setup.
        envs.GOOGLE_CLOUD_QUOTA_PROJECT = this.args.projectId;
        if (trigger) {
            const target = trigger.entryPoint;
            envs.FUNCTION_TARGET = target;
            envs.FUNCTION_SIGNATURE_TYPE = (0, functionsEmulatorShared_1.getSignatureType)(trigger);
            envs.K_SERVICE = trigger.name;
        }
        return envs;
    }
    getEmulatorEnvs() {
        const envs = {};
        envs.FUNCTIONS_EMULATOR = "true";
        envs.TZ = "UTC"; // Fixes https://github.com/firebase/firebase-tools/issues/2253
        envs.FIREBASE_DEBUG_MODE = "true";
        envs.FIREBASE_DEBUG_FEATURES = JSON.stringify({
            skipTokenVerification: true,
            enableCors: true,
        });
        let emulatorInfos = registry_1.EmulatorRegistry.listRunningWithInfo();
        if (this.args.remoteEmulators) {
            emulatorInfos = emulatorInfos.concat(Object.values(this.args.remoteEmulators));
        }
        (0, env_1.setEnvVarsForEmulators)(envs, emulatorInfos);
        if (this.debugMode) {
            // Start runtime in debug mode to allow triggers to share single runtime process.
            envs["FUNCTION_DEBUG_MODE"] = "true";
        }
        return envs;
    }
    getFirebaseConfig() {
        const databaseEmulator = this.getEmulatorInfo(types_1.Emulators.DATABASE);
        let emulatedDatabaseURL = undefined;
        if (databaseEmulator) {
            // Database URL will look like one of:
            //  - https://${namespace}.firebaseio.com
            //  - https://${namespace}.${location}.firebasedatabase.app
            let ns = this.args.projectId;
            if (this.adminSdkConfig.databaseURL) {
                const asUrl = new url_1.URL(this.adminSdkConfig.databaseURL);
                ns = asUrl.hostname.split(".")[0];
            }
            emulatedDatabaseURL = `http://${(0, functionsEmulatorShared_1.formatHost)(databaseEmulator)}/?ns=${ns}`;
        }
        return JSON.stringify({
            storageBucket: this.adminSdkConfig.storageBucket,
            databaseURL: emulatedDatabaseURL || this.adminSdkConfig.databaseURL,
            projectId: this.args.projectId,
        });
    }
    getRuntimeEnvs(backend, trigger) {
        return {
            ...this.getUserEnvs(backend),
            ...this.getSystemEnvs(trigger),
            ...this.getEmulatorEnvs(),
            FIREBASE_CONFIG: this.getFirebaseConfig(),
            ...backend.env,
        };
    }
    async resolveSecretEnvs(backend, trigger) {
        let secretEnvs = {};
        const secretPath = (0, functionsEmulatorShared_1.getSecretLocalPath)(backend, this.args.projectDir);
        try {
            const data = fs.readFileSync(secretPath, "utf8");
            secretEnvs = functionsEnv.parseStrict(data);
        }
        catch (e) {
            if (e.code !== "ENOENT") {
                this.logger.logLabeled("ERROR", "functions", `Failed to read local secrets file ${secretPath}: ${e.message}`);
            }
        }
        // Note - if trigger is undefined, we are loading in 'sequential' mode.
        // In that case, we need to load all secrets for that codebase.
        const secrets = trigger?.secretEnvironmentVariables || backend.secretEnv;
        const accesses = secrets
            .filter((s) => !secretEnvs[s.key])
            .map(async (s) => {
            this.logger.logLabeled("INFO", "functions", `Trying to access secret ${s.secret}@latest`);
            const value = await (0, secretManager_1.accessSecretVersion)(this.getProjectId(), s.secret, s.version ?? "latest");
            return [s.key, value];
        });
        const accessResults = await (0, utils_1.allSettled)(accesses);
        const errs = [];
        for (const result of accessResults) {
            if (result.status === "rejected") {
                errs.push(result.reason);
            }
            else {
                const [k, v] = result.value;
                secretEnvs[k] = v;
            }
        }
        if (errs.length > 0) {
            this.logger.logLabeled("ERROR", "functions", "Unable to access secret environment variables from Google Cloud Secret Manager. " +
                "Make sure the credential used for the Functions Emulator have access " +
                `or provide override values in ${secretPath}:\n\t` +
                errs.join("\n\t"));
        }
        return secretEnvs;
    }
    async startNode(backend, envs) {
        const args = [path.join(__dirname, "functionsEmulatorRuntime")];
        if (this.debugMode) {
            if (process.env.FIREPIT_VERSION) {
                this.logger.log("WARN", `To enable function inspection, please run "npm i node@${semver.coerce(backend.runtime || "18.0.0")} --save-dev" in your functions directory`);
            }
            else {
                let port;
                if (typeof this.args.debugPort === "number") {
                    port = this.args.debugPort;
                }
                else {
                    // Start the search at port 9229 because that is the default node
                    // inspector port and Chrome et. al. will discover the process without
                    // additional configuration. Other dynamic ports will need to be added
                    // manually to the inspector.
                    port = await portfinder.getPortPromise({ port: 9229 });
                    if (port === 9229) {
                        this.logger.logLabeled("SUCCESS", "functions", `Using debug port 9229 for functions codebase ${backend.codebase}`);
                    }
                    else {
                        // Give a longer message to warn about non-default ports.
                        this.logger.logLabeled("SUCCESS", "functions", `Using debug port ${port} for functions codebase ${backend.codebase}. ` +
                            "You may need to add manually add this port to your inspector.");
                    }
                }
                const { host } = this.getInfo();
                args.unshift(`--inspect=${(0, utils_1.connectableHostname)(host)}:${port}`);
            }
        }
        // Yarn 2 has a new feature called PnP (Plug N Play) which aims to completely take over
        // module resolution. This feature is mostly incompatible with CF3 (prod or emulated) so
        // if we detect it we should warn the developer.
        // See: https://classic.yarnpkg.com/en/docs/pnp/
        const pnpPath = path.join(backend.functionsDir, ".pnp.js");
        if (fs.existsSync(pnpPath)) {
            emulatorLogger_1.EmulatorLogger.forEmulator(types_1.Emulators.FUNCTIONS).logLabeled("WARN_ONCE", "functions", "Detected yarn@2 with PnP. " +
                "Cloud Functions for Firebase requires a node_modules folder to work correctly and is therefore incompatible with PnP. " +
                "See https://yarnpkg.com/getting-started/migration#step-by-step for more information.");
        }
        const bin = backend.bin;
        if (!bin) {
            throw new Error(`No binary associated with ${backend.functionsDir}. ` +
                "Make sure function runtime is configured correctly in firebase.json.");
        }
        const socketPath = (0, functionsEmulatorShared_1.getTemporarySocketPath)();
        const childProcess = spawn(bin, args, {
            cwd: backend.functionsDir,
            env: {
                node: backend.bin,
                METADATA_SERVER_DETECTION: "none",
                ...process.env,
                ...envs,
                PORT: socketPath,
            },
            stdio: ["pipe", "pipe", "pipe", "ipc"],
        });
        return Promise.resolve({
            process: childProcess,
            events: new events_1.EventEmitter(),
            cwd: backend.functionsDir,
            conn: new IPCConn(socketPath),
        });
    }
    async startPython(backend, envs) {
        const args = ["functions-framework"];
        if (this.debugMode) {
            this.logger.log("WARN", "--inspect-functions not supported for Python functions. Ignored.");
        }
        // No support generic socket interface for Unix Domain Socket/Named Pipe in the python.
        // Use TCP/IP stack instead.
        const port = await portfinder.getPortPromise({
            port: 8081 + (0, utils_1.randomInt)(0, 1000), // Add a small jitter to avoid race condition.
        });
        const childProcess = (0, python_1.runWithVirtualEnv)(args, backend.functionsDir, {
            ...process.env,
            ...envs,
            // Required to flush stdout/stderr immediately to the piped channels.
            PYTHONUNBUFFERED: "1",
            // Required to prevent flask development server to reload on code changes.
            DEBUG: "False",
            HOST: "127.0.0.1",
            PORT: port.toString(),
        });
        return {
            process: childProcess,
            events: new events_1.EventEmitter(),
            cwd: backend.functionsDir,
            conn: new TCPConn("127.0.0.1", port),
        };
    }
    async startRuntime(backend, trigger) {
        const runtimeEnv = this.getRuntimeEnvs(backend, trigger);
        const secretEnvs = await this.resolveSecretEnvs(backend, trigger);
        let runtime;
        if (backend.runtime.startsWith("python")) {
            runtime = await this.startPython(backend, { ...runtimeEnv, ...secretEnvs });
        }
        else {
            runtime = await this.startNode(backend, { ...runtimeEnv, ...secretEnvs });
        }
        const extensionLogInfo = {
            instanceId: backend.extensionInstanceId,
            ref: backend.extensionVersion?.ref,
        };
        const pool = this.workerPools[backend.codebase];
        const worker = pool.addWorker(trigger, runtime, extensionLogInfo);
        await worker.waitForSocketReady();
        return worker;
    }
    async disableBackgroundTriggers() {
        Object.values(this.triggers).forEach((record) => {
            if (record.def.eventTrigger && record.enabled) {
                this.logger.logLabeled("BULLET", `functions[${record.def.entryPoint}]`, "function temporarily disabled.");
                record.enabled = false;
            }
        });
        await this.workQueue.flush();
    }
    async reloadTriggers() {
        this.triggerGeneration++;
        // reset blocking functions config for reloads
        this.blockingFunctionsConfig = {};
        for (const backend of this.staticBackends.concat(this.dynamicBackends)) {
            await this.loadTriggers(backend);
        }
        await this.performPostLoadOperations();
        return;
    }
    /**
     * Gets the address of a running emulator, either from explicit args or by
     * consulting the emulator registry.
     * @param emulator
     */
    getEmulatorInfo(emulator) {
        if (this.args.remoteEmulators?.[emulator]) {
            return this.args.remoteEmulators[emulator];
        }
        return registry_1.EmulatorRegistry.getInfo(emulator);
    }
    tokenFromAuthHeader(authHeader) {
        const match = /^Bearer (.*)$/.exec(authHeader);
        if (!match) {
            return;
        }
        let idToken = match[1];
        logger_1.logger.debug(`ID Token: ${idToken}`);
        // The @firebase/testing library sometimes produces JWTs with invalid padding, so we
        // remove that via regex. This is the spec that says trailing = should be removed:
        // https://tools.ietf.org/html/rfc7515#section-2
        if (idToken && idToken.includes("=")) {
            idToken = idToken.replace(/[=]+?\./g, ".");
            logger_1.logger.debug(`ID Token contained invalid padding, new value: ${idToken}`);
        }
        try {
            const decoded = jwt.decode(idToken, { complete: true });
            if (!decoded || typeof decoded !== "object") {
                logger_1.logger.debug(`Failed to decode ID Token: ${decoded}`);
                return;
            }
            // In firebase-functions we manually copy 'sub' to 'uid'
            // https://github.com/firebase/firebase-admin-node/blob/0b2082f1576f651e75069e38ce87e639c25289af/src/auth/token-verifier.ts#L249
            const claims = decoded.payload;
            claims.uid = claims.sub;
            return claims;
        }
        catch (e) {
            return;
        }
    }
    async handleHttpsTrigger(req, res) {
        const method = req.method;
        let triggerId = req.params.trigger_name;
        if (req.params.region) {
            triggerId = `${req.params.region}-${triggerId}`;
        }
        if (!this.triggers[triggerId]) {
            res
                .status(404)
                .send(`Function ${triggerId} does not exist, valid functions are: ${Object.keys(this.triggers).join(", ")}`);
            return;
        }
        const record = this.getTriggerRecordByKey(triggerId);
        // If trigger is disabled, exit early
        if (!record.enabled) {
            res.status(204).send("Background triggers are currently disabled.");
            return;
        }
        const trigger = record.def;
        logger_1.logger.debug(`Accepted request ${method} ${req.url} --> ${triggerId}`);
        let reqBody = req.rawBody;
        // When the payload is a protobuf, EventArc converts a base64 encoded string into a byte array before sending the
        // request to the function. Let's mimic that behavior.
        if ((0, functionsEmulatorShared_1.getSignatureType)(trigger) === "cloudevent") {
            if (req.headers["content-type"]?.includes("application/protobuf")) {
                reqBody = Uint8Array.from(atob(reqBody.toString()), (c) => c.charCodeAt(0));
                req.headers["content-length"] = reqBody.length.toString();
            }
        }
        // For callable functions we want to accept tokens without actually calling verifyIdToken
        const isCallable = trigger.labels && trigger.labels["deployment-callable"] === "true";
        const authHeader = req.header("Authorization");
        if (authHeader && isCallable && trigger.platform !== "gcfv2") {
            const token = this.tokenFromAuthHeader(authHeader);
            if (token) {
                const contextAuth = {
                    uid: token.uid,
                    token: token,
                };
                // Stash the "Authorization" header in a temporary place, we will replace it
                // when invoking the callable handler
                req.headers[functionsEmulatorShared_1.HttpConstants.ORIGINAL_AUTH_HEADER] = req.headers["authorization"];
                delete req.headers["authorization"];
                req.headers[functionsEmulatorShared_1.HttpConstants.CALLABLE_AUTH_HEADER] = encodeURIComponent(JSON.stringify(contextAuth));
            }
        }
        // For analytics, track the invoked service
        void (0, track_1.trackEmulator)(EVENT_INVOKE_GA4, {
            function_service: (0, functionsEmulatorShared_1.getFunctionService)(trigger),
        });
        this.logger.log("DEBUG", `[functions] Runtime ready! Sending request!`);
        // To match production behavior we need to drop the path prefix
        // req.url = /:projectId/:region/:trigger_name/*
        const url = new url_1.URL(`${req.protocol}://${req.hostname}${req.url}`);
        const path = `${url.pathname}${url.search}`.replace(new RegExp(`\/${this.args.projectId}\/[^\/]*\/${req.params.trigger_name}\/?`), "/");
        // We do this instead of just 302'ing because many HTTP clients don't respect 302s so it may
        // cause unexpected situations - not to mention CORS troubles and this enables us to use
        // a socketPath (IPC socket) instead of consuming yet another port which is probably faster as well.
        this.logger.log("DEBUG", `[functions] Got req.url=${req.url}, mapping to path=${path}`);
        const pool = this.workerPools[record.backend.codebase];
        if (!pool.readyForWork(trigger.id)) {
            try {
                await this.startRuntime(record.backend, trigger);
            }
            catch (e) {
                this.logger.logLabeled("ERROR", `Failed to handle request for function ${trigger.id}`);
                this.logger.logLabeled("ERROR", `Failed to start functions in ${record.backend.functionsDir}: ${e}`);
                return;
            }
        }
        let debugBundle;
        if (this.debugMode) {
            debugBundle = {
                functionTarget: trigger.entryPoint,
                functionSignature: (0, functionsEmulatorShared_1.getSignatureType)(trigger),
            };
        }
        await pool.submitRequest(trigger.id, {
            method,
            path,
            headers: req.headers,
        }, res, reqBody, debugBundle);
    }
}
exports.FunctionsEmulator = FunctionsEmulator;
//# sourceMappingURL=functionsEmulator.js.map