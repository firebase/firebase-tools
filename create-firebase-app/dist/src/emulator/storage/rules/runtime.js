"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StorageRulesRuntime = exports.StorageRulesIssues = exports.StorageRulesetInstance = void 0;
const cross_spawn_1 = require("cross-spawn");
const error_1 = require("../../../error");
const AsyncLock = require("async-lock");
const types_1 = require("./types");
const jwt = require("jsonwebtoken");
const emulatorLogger_1 = require("../../emulatorLogger");
const types_2 = require("../../types");
const metadata_1 = require("../metadata");
const utils = require("../../../utils");
const constants_1 = require("../../constants");
const download_1 = require("../../download");
const fs = require("fs-extra");
const downloadableEmulators_1 = require("../../downloadableEmulators");
const registry_1 = require("../../registry");
const lock = new AsyncLock();
const synchonizationKey = "key";
class StorageRulesetInstance {
    constructor(runtime, rulesVersion, rulesetName) {
        this.runtime = runtime;
        this.rulesVersion = rulesVersion;
        this.rulesetName = rulesetName;
    }
    async verify(opts, runtimeVariableOverrides = {}) {
        if (opts.method === types_1.RulesetOperationMethod.LIST && this.rulesVersion < 2) {
            const issues = new StorageRulesIssues();
            issues.warnings.push("Permission denied. List operations are only allowed for rules_version='2'.");
            return {
                permitted: false,
                issues,
            };
        }
        return this.runtime.verifyWithRuleset(this.rulesetName, opts, runtimeVariableOverrides);
    }
    unload() {
        throw new Error("NOT_IMPLEMENTED");
    }
}
exports.StorageRulesetInstance = StorageRulesetInstance;
class StorageRulesIssues {
    constructor(errors = [], warnings = []) {
        this.errors = errors;
        this.warnings = warnings;
    }
    static fromResponse(resp) {
        return new StorageRulesIssues(resp.errors || [], resp.warnings || []);
    }
    get all() {
        return [...this.errors, ...this.warnings];
    }
    exist() {
        return !!(this.errors.length || this.warnings.length);
    }
    extend(other) {
        this.errors.push(...other.errors);
        this.warnings.push(...other.warnings);
    }
}
exports.StorageRulesIssues = StorageRulesIssues;
class StorageRulesRuntime {
    constructor() {
        this._rulesetCount = 0;
        this._requestCount = 0;
        this._requests = {};
        this._alive = false;
    }
    get alive() {
        return this._alive;
    }
    async start(autoDownload = true) {
        var _a, _b;
        if (this.alive) {
            return;
        }
        const downloadDetails = (0, downloadableEmulators_1.getDownloadDetails)(types_2.Emulators.STORAGE);
        const hasEmulator = fs.existsSync(downloadDetails.downloadPath);
        if (!hasEmulator) {
            if (autoDownload) {
                if (process.env.CI) {
                    utils.logWarning(`It appears you are running in a CI environment. You can avoid downloading the ${constants_1.Constants.description(types_2.Emulators.STORAGE)} repeatedly by caching the ${downloadDetails.opts.cacheDir} directory.`);
                }
                await (0, download_1.downloadEmulator)(types_2.Emulators.STORAGE);
            }
            else {
                utils.logWarning("Setup required, please run: firebase setup:emulators:storage");
                throw new error_1.FirebaseError("emulator not found");
            }
        }
        this._alive = true;
        const command = (0, downloadableEmulators_1._getCommand)(types_2.Emulators.STORAGE, {});
        this._childprocess = (0, cross_spawn_1.spawn)(command.binary, command.args, {
            stdio: ["pipe", "pipe", "pipe"],
        });
        this._childprocess.on("exit", () => {
            var _a;
            this._alive = false;
            (_a = this._childprocess) === null || _a === void 0 ? void 0 : _a.removeAllListeners();
            this._childprocess = undefined;
        });
        const startPromise = new Promise((resolve) => {
            this._requests[-1] = {
                handler: resolve,
                request: {
                    action: "",
                    id: -1,
                },
            };
        });
        // This catches error when spawning the java process
        this._childprocess.on("error", (err) => {
            void (0, downloadableEmulators_1.handleEmulatorProcessError)(types_2.Emulators.STORAGE, err);
        });
        // This catches errors from the java process (i.e. missing jar file)
        (_a = this._childprocess.stderr) === null || _a === void 0 ? void 0 : _a.on("data", (buf) => {
            const error = buf.toString();
            if (error.includes("jarfile")) {
                emulatorLogger_1.EmulatorLogger.forEmulator(types_2.Emulators.STORAGE).log("ERROR", error);
                throw new error_1.FirebaseError("There was an issue starting the rules emulator, please run 'firebase setup:emulators:storage` again");
            }
            else {
                emulatorLogger_1.EmulatorLogger.forEmulator(types_2.Emulators.STORAGE).log("WARN", `Unexpected rules runtime error: ${buf.toString()}`);
            }
        });
        (_b = this._childprocess.stdout) === null || _b === void 0 ? void 0 : _b.on("data", (buf) => {
            var _a;
            const serializedRuntimeActionResponse = buf.toString("utf-8").trim();
            if (serializedRuntimeActionResponse !== "") {
                let rap;
                try {
                    rap = JSON.parse(serializedRuntimeActionResponse);
                }
                catch (err) {
                    emulatorLogger_1.EmulatorLogger.forEmulator(types_2.Emulators.STORAGE).log("INFO", serializedRuntimeActionResponse);
                    return;
                }
                const id = (_a = rap.id) !== null && _a !== void 0 ? _a : rap.server_request_id;
                if (id === undefined) {
                    console.log(`Received no ID from server response ${serializedRuntimeActionResponse}`);
                    return;
                }
                const request = this._requests[id];
                if (rap.status !== "ok" && !("action" in rap)) {
                    console.warn(`[RULES] ${rap.status}: ${rap.message}`);
                    rap.errors.forEach(console.warn.bind(console));
                    return;
                }
                if (request) {
                    request.handler(rap);
                }
                else {
                    console.log(`No handler for event ${serializedRuntimeActionResponse}`);
                }
            }
        });
        return startPromise;
    }
    stop() {
        emulatorLogger_1.EmulatorLogger.forEmulator(types_2.Emulators.STORAGE).log("DEBUG", "Stopping rules runtime.");
        return new Promise((resolve) => {
            var _a;
            if (this.alive) {
                this._childprocess.on("exit", () => {
                    resolve();
                });
                (_a = this._childprocess) === null || _a === void 0 ? void 0 : _a.kill("SIGINT");
            }
            else {
                resolve();
            }
        });
    }
    async _sendRequest(rab, overrideId) {
        if (!this._childprocess) {
            throw new error_1.FirebaseError("Failed to send Cloud Storage rules request due to rules runtime not available.");
        }
        const runtimeActionRequest = Object.assign(Object.assign({}, rab), { id: overrideId !== null && overrideId !== void 0 ? overrideId : this._requestCount++ });
        // If `overrideId` is set, we are to use this ID to send to Rules.
        // This happens when there is a back-and-forth interaction with Rules,
        // meaning we also need to delete the old request and await the new
        // response with the same ID.
        if (overrideId !== undefined) {
            delete this._requests[overrideId];
        }
        else if (this._requests[runtimeActionRequest.id]) {
            throw new error_1.FirebaseError("Attempted to send Cloud Storage rules request with stale id");
        }
        return new Promise((resolve) => {
            this._requests[runtimeActionRequest.id] = {
                request: runtimeActionRequest,
                handler: resolve,
            };
            const serializedRequest = JSON.stringify(runtimeActionRequest);
            // Added due to https://github.com/firebase/firebase-tools/issues/3915
            // Without waiting to acquire the lock and allowing the child process enough time
            // (~15ms) to pipe the output back, the emulator will run into issues with
            // capturing the output and resolving corresponding promises en masse.
            lock.acquire(synchonizationKey, (done) => {
                var _a, _b;
                (_b = (_a = this._childprocess) === null || _a === void 0 ? void 0 : _a.stdin) === null || _b === void 0 ? void 0 : _b.write(serializedRequest + "\n");
                setTimeout(() => {
                    done();
                }, 15);
            });
        });
    }
    async loadRuleset(source) {
        // Load ruleset into runtime w/ id
        const runtimeActionRequest = {
            action: "load_ruleset",
            context: {
                rulesetName: (this._rulesetCount++).toString(),
                source,
            },
        };
        const response = (await this._sendRequest(runtimeActionRequest));
        if (response.errors.length) {
            return {
                issues: StorageRulesIssues.fromResponse(response),
            };
        }
        else {
            return {
                issues: StorageRulesIssues.fromResponse(response),
                ruleset: new StorageRulesetInstance(this, response.result.rulesVersion, runtimeActionRequest.context.rulesetName),
            };
        }
    }
    async verifyWithRuleset(rulesetName, opts, runtimeVariableOverrides = {}) {
        if (!opts.path.startsWith("/")) {
            opts.path = `/${opts.path}`;
        }
        if (opts.path.endsWith("/")) {
            opts.path = opts.path.slice(0, -1);
        }
        const runtimeVariables = Object.assign({ resource: toExpressionValue(opts.file.before || null), request: createRequestExpressionValue(opts) }, runtimeVariableOverrides);
        const runtimeActionRequest = {
            action: "verify",
            context: {
                rulesetName: rulesetName,
                service: "firebase.storage",
                path: opts.path,
                method: opts.method,
                delimiter: opts.delimiter,
                variables: runtimeVariables,
            },
        };
        return this._completeVerifyWithRuleset(opts.projectId, runtimeActionRequest);
    }
    async _completeVerifyWithRuleset(projectId, runtimeActionRequest, overrideId) {
        const response = (await this._sendRequest(runtimeActionRequest, overrideId));
        if ("context" in response) {
            const dataResponse = await fetchFirestoreDocument(projectId, response);
            return this._completeVerifyWithRuleset(projectId, dataResponse, response.server_request_id);
        }
        if (!response.errors)
            response.errors = [];
        if (!response.warnings)
            response.warnings = [];
        if (response.errors.length) {
            return {
                issues: StorageRulesIssues.fromResponse(response),
            };
        }
        else {
            return {
                issues: StorageRulesIssues.fromResponse(response),
                permitted: response.result.permit,
            };
        }
    }
}
exports.StorageRulesRuntime = StorageRulesRuntime;
function toExpressionValue(obj) {
    if (typeof obj === "string") {
        return { string_value: obj };
    }
    if (typeof obj === "boolean") {
        return { bool_value: obj };
    }
    if (typeof obj === "number") {
        if (Math.floor(obj) === obj) {
            return { int_value: obj };
        }
        else {
            return { float_value: obj };
        }
    }
    if (obj instanceof Date) {
        return {
            timestamp_value: (0, metadata_1.toSerializedDate)(obj),
        };
    }
    if (Array.isArray(obj)) {
        return {
            list_value: {
                values: obj.map(toExpressionValue),
            },
        };
    }
    if (obj instanceof Set) {
        return {
            set_value: {
                values: [...obj].map(toExpressionValue),
            },
        };
    }
    if (obj == null) {
        return {
            null_value: null,
        };
    }
    if (typeof obj === "object") {
        const fields = {};
        Object.keys(obj).forEach((key) => {
            fields[key] = toExpressionValue(obj[key]);
        });
        return {
            map_value: {
                fields,
            },
        };
    }
    throw new error_1.FirebaseError(`Cannot convert "${obj}" of type ${typeof obj} for Firebase Storage rules runtime`);
}
async function fetchFirestoreDocument(projectId, request) {
    const pathname = `projects/${projectId}${request.context.path}`;
    const client = registry_1.EmulatorRegistry.client(types_2.Emulators.FIRESTORE, { apiVersion: "v1", auth: true });
    try {
        const doc = await client.get(pathname);
        const { name, fields } = doc.body;
        const result = { name, fields };
        return { result, status: types_1.DataLoadStatus.OK, warnings: [], errors: [] };
    }
    catch (e) {
        // Don't care what the error is, just return not_found
        return { status: types_1.DataLoadStatus.NOT_FOUND, warnings: [], errors: [] };
    }
}
function createAuthExpressionValue(opts) {
    if (!opts.token) {
        return toExpressionValue(null);
    }
    else {
        const tokenPayload = jwt.decode(opts.token, { json: true });
        const jsonValue = {
            uid: tokenPayload.user_id,
            token: tokenPayload,
        };
        return toExpressionValue(jsonValue);
    }
}
function createRequestExpressionValue(opts) {
    const fields = {
        path: {
            path_value: {
                segments: opts.path
                    .split("/")
                    .filter((s) => s)
                    .map((simple) => ({
                    simple,
                })),
            },
        },
        time: toExpressionValue(new Date()),
        resource: toExpressionValue(opts.file.after ? opts.file.after : null),
        auth: opts.token ? createAuthExpressionValue(opts) : { null_value: null },
    };
    return {
        map_value: {
            fields,
        },
    };
}
