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
exports.RuntimeWorkerPool = exports.RuntimeWorker = exports.RuntimeWorkerState = void 0;
const http = __importStar(require("http"));
const uuid = __importStar(require("uuid"));
const types_1 = require("./types");
const events_1 = require("events");
const emulatorLogger_1 = require("./emulatorLogger");
const error_1 = require("../error");
const discovery_1 = require("../deploy/functions/runtimes/discovery");
var RuntimeWorkerState;
(function (RuntimeWorkerState) {
    // Worker has been created but is not ready to accept work
    RuntimeWorkerState["CREATED"] = "CREATED";
    // Worker is ready to accept new work
    RuntimeWorkerState["IDLE"] = "IDLE";
    // Worker is currently doing work
    RuntimeWorkerState["BUSY"] = "BUSY";
    // Worker is BUSY and when done will be killed rather
    // than recycled.
    RuntimeWorkerState["FINISHING"] = "FINISHING";
    // Worker has exited and cannot be re-used
    RuntimeWorkerState["FINISHED"] = "FINISHED";
})(RuntimeWorkerState = exports.RuntimeWorkerState || (exports.RuntimeWorkerState = {}));
/**
 * Given no trigger key, worker is given this special key.
 *
 * This is useful when running the Functions Emulator in debug mode
 * where single process shared amongst all triggers.
 */
const FREE_WORKER_KEY = "~free~";
class RuntimeWorker {
    constructor(triggerId, runtime, extensionLogInfo, timeoutSeconds) {
        this.runtime = runtime;
        this.extensionLogInfo = extensionLogInfo;
        this.timeoutSeconds = timeoutSeconds;
        this.stateEvents = new events_1.EventEmitter();
        this.logListeners = [];
        this._state = RuntimeWorkerState.CREATED;
        this.id = uuid.v4();
        this.triggerKey = triggerId || FREE_WORKER_KEY;
        this.runtime = runtime;
        const childProc = this.runtime.process;
        let msgBuffer = "";
        childProc.on("message", (msg) => {
            msgBuffer = this.processStream(msg, msgBuffer);
        });
        let stdBuffer = "";
        if (childProc.stdout) {
            childProc.stdout.on("data", (data) => {
                stdBuffer = this.processStream(data, stdBuffer);
            });
        }
        if (childProc.stderr) {
            childProc.stderr.on("data", (data) => {
                stdBuffer = this.processStream(data, stdBuffer);
            });
        }
        this.logger = triggerId
            ? emulatorLogger_1.EmulatorLogger.forFunction(triggerId, extensionLogInfo)
            : emulatorLogger_1.EmulatorLogger.forEmulator(types_1.Emulators.FUNCTIONS);
        this.onLogs((log) => {
            this.logger.handleRuntimeLog(log);
        }, true /* listen forever */);
        childProc.on("exit", () => {
            this.logDebug("exited");
            this.state = RuntimeWorkerState.FINISHED;
        });
    }
    processStream(s, buf) {
        buf += s.toString();
        const lines = buf.split("\n");
        if (lines.length > 1) {
            // slice(0, -1) returns all elements but the last
            lines.slice(0, -1).forEach((line) => {
                const log = types_1.EmulatorLog.fromJSON(line);
                this.runtime.events.emit("log", log);
                if (log.level === "FATAL") {
                    // Something went wrong, if we don't kill the process it'll wait for timeoutMs.
                    this.runtime.events.emit("log", new types_1.EmulatorLog("SYSTEM", "runtime-status", "killed"));
                    this.runtime.process.kill();
                }
            });
        }
        return lines[lines.length - 1];
    }
    readyForWork() {
        this.state = RuntimeWorkerState.IDLE;
    }
    sendDebugMsg(debug) {
        return new Promise((resolve, reject) => {
            this.runtime.process.send(JSON.stringify(debug), (err) => {
                if (err) {
                    reject(err);
                }
                else {
                    resolve();
                }
            });
        });
    }
    request(req, resp, body, debug) {
        if (this.triggerKey !== FREE_WORKER_KEY) {
            this.logInfo(`Beginning execution of "${this.triggerKey}"`);
        }
        const startHrTime = process.hrtime();
        this.state = RuntimeWorkerState.BUSY;
        const onFinish = () => {
            if (this.triggerKey !== FREE_WORKER_KEY) {
                const elapsedHrTime = process.hrtime(startHrTime);
                this.logInfo(`Finished "${this.triggerKey}" in ${elapsedHrTime[0] * 1000 + elapsedHrTime[1] / 1000000}ms`);
            }
            if (this.state === RuntimeWorkerState.BUSY) {
                this.state = RuntimeWorkerState.IDLE;
            }
            else if (this.state === RuntimeWorkerState.FINISHING) {
                this.logDebug(`IDLE --> FINISHING`);
                this.runtime.process.kill();
            }
        };
        return new Promise((resolve) => {
            const reqOpts = {
                ...this.runtime.conn.httpReqOpts(),
                method: req.method,
                path: req.path,
                headers: req.headers,
            };
            if (this.timeoutSeconds) {
                reqOpts.timeout = this.timeoutSeconds * 1000;
            }
            const proxy = http.request(reqOpts, (_resp) => {
                resp.writeHead(_resp.statusCode || 200, _resp.headers);
                let finished = false;
                const finishReq = (event) => {
                    this.logger.log("DEBUG", `Finishing up request with event=${event}`);
                    if (!finished) {
                        finished = true;
                        onFinish();
                        resolve();
                    }
                };
                _resp.on("pause", () => finishReq("pause"));
                _resp.on("close", () => finishReq("close"));
                const piped = _resp.pipe(resp);
                piped.on("finish", () => finishReq("finish"));
            });
            if (debug) {
                proxy.setSocketKeepAlive(false);
                proxy.setTimeout(0);
            }
            proxy.on("timeout", () => {
                this.logger.log("ERROR", `Your function timed out after ~${this.timeoutSeconds}s. To configure this timeout, see
      https://firebase.google.com/docs/functions/manage-functions#set_timeout_and_memory_allocation.`);
                proxy.destroy();
            });
            proxy.on("error", (err) => {
                this.logger.log("ERROR", `Request to function failed: ${err}`);
                resp.writeHead(500);
                resp.write(JSON.stringify(err));
                resp.end();
                this.runtime.process.kill();
                resolve();
            });
            if (body) {
                proxy.write(body);
            }
            proxy.end();
        });
    }
    get state() {
        return this._state;
    }
    set state(state) {
        if (state === RuntimeWorkerState.IDLE) {
            // Remove all temporary log listeners every time we move to IDLE
            for (const l of this.logListeners) {
                this.runtime.events.removeListener("log", l);
            }
            this.logListeners = [];
        }
        if (state === RuntimeWorkerState.FINISHED) {
            this.runtime.events.removeAllListeners();
        }
        this.logDebug(state);
        this._state = state;
        this.stateEvents.emit(this._state);
    }
    onLogs(listener, forever = false) {
        if (!forever) {
            this.logListeners.push(listener);
        }
        this.runtime.events.on("log", listener);
    }
    isSocketReady() {
        return new Promise((resolve, reject) => {
            const req = http.request({
                ...this.runtime.conn.httpReqOpts(),
                method: "GET",
                path: "/__/health",
            }, () => {
                // Set the worker state to IDLE for new work
                this.readyForWork();
                resolve();
            });
            req.end();
            req.on("error", (error) => {
                reject(error);
            });
        });
    }
    async waitForSocketReady() {
        const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
        const timeout = new Promise((resolve, reject) => {
            setTimeout(() => {
                reject(new error_1.FirebaseError("Failed to load function."));
            }, (0, discovery_1.getFunctionDiscoveryTimeout)() || 30000);
        });
        while (true) {
            try {
                await Promise.race([this.isSocketReady(), timeout]);
                break;
            }
            catch (err) {
                // Allow us to wait until the server is listening.
                if (["ECONNREFUSED", "ENOENT"].includes(err?.code)) {
                    await sleep(100);
                    continue;
                }
                throw err;
            }
        }
    }
    logDebug(msg) {
        this.logger.log("DEBUG", `[worker-${this.triggerKey}-${this.id}]: ${msg}`);
    }
    logInfo(msg) {
        this.logger.logLabeled("BULLET", "functions", msg);
    }
}
exports.RuntimeWorker = RuntimeWorker;
class RuntimeWorkerPool {
    constructor(mode = types_1.FunctionsExecutionMode.AUTO) {
        this.mode = mode;
        this.workers = new Map();
    }
    getKey(triggerId) {
        if (this.mode === types_1.FunctionsExecutionMode.SEQUENTIAL) {
            return "~shared~";
        }
        else {
            return triggerId || "~diagnostic~";
        }
    }
    /**
     * When code changes (or in some other rare circumstances) we need to get
     * a new pool of workers. For each IDLE worker we kill it immediately. For
     * each BUSY worker we move it to the FINISHING state so that it will
     * kill itself after it's done with its current task.
     */
    refresh() {
        for (const arr of this.workers.values()) {
            arr.forEach((w) => {
                if (w.state === RuntimeWorkerState.IDLE) {
                    this.log(`Shutting down IDLE worker (${w.triggerKey})`);
                    w.state = RuntimeWorkerState.FINISHING;
                    w.runtime.process.kill();
                }
                else if (w.state === RuntimeWorkerState.BUSY) {
                    this.log(`Marking BUSY worker to finish (${w.triggerKey})`);
                    w.state = RuntimeWorkerState.FINISHING;
                }
            });
        }
    }
    /**
     * Immediately kill all workers.
     */
    exit() {
        for (const arr of this.workers.values()) {
            arr.forEach((w) => {
                if (w.state === RuntimeWorkerState.IDLE) {
                    w.runtime.process.kill();
                }
                else {
                    w.runtime.process.kill();
                }
            });
        }
    }
    /**
     * Determine if the pool has idle workers ready to accept work for the given triggerId;
     *
     * @param triggerId
     */
    readyForWork(triggerId) {
        const idleWorker = this.getIdleWorker(triggerId);
        return !!idleWorker;
    }
    /**
     * Submit request to be handled by an idle worker for the given triggerId.
     * Caller should ensure that there is an idle worker to handle the request.
     *
     * @param triggerId
     * @param req Request to send to the trigger.
     * @param resp Response to proxy the response from the worker.
     * @param body Request body.
     * @param debug Debug payload to send prior to making request.
     */
    async submitRequest(triggerId, req, resp, body, debug) {
        this.log(`submitRequest(triggerId=${triggerId})`);
        const worker = this.getIdleWorker(triggerId);
        if (!worker) {
            throw new error_1.FirebaseError("Internal Error: can't call submitRequest without checking for idle workers");
        }
        if (debug) {
            await worker.sendDebugMsg(debug);
        }
        return worker.request(req, resp, body, !!debug);
    }
    getIdleWorker(triggerId) {
        this.cleanUpWorkers();
        const triggerWorkers = this.getTriggerWorkers(triggerId);
        if (!triggerWorkers.length) {
            this.setTriggerWorkers(triggerId, []);
            return;
        }
        for (const worker of triggerWorkers) {
            if (worker.state === RuntimeWorkerState.IDLE) {
                return worker;
            }
        }
        return;
    }
    /**
     * Adds a worker to the pool.
     * Caller must set the worker status to ready by calling
     * `worker.readyForWork()` or `worker.waitForSocketReady()`.
     */
    addWorker(trigger, runtime, extensionLogInfo) {
        this.log(`addWorker(${this.getKey(trigger?.id)})`);
        // Disable worker timeout if:
        //   (1) This is a diagnostic call without trigger id OR
        //   (2) If in SEQUENTIAL execution mode
        const disableTimeout = !trigger?.id || this.mode === types_1.FunctionsExecutionMode.SEQUENTIAL;
        const worker = new RuntimeWorker(trigger?.id, runtime, extensionLogInfo, disableTimeout ? undefined : trigger?.timeoutSeconds);
        const keyWorkers = this.getTriggerWorkers(trigger?.id);
        keyWorkers.push(worker);
        this.setTriggerWorkers(trigger?.id, keyWorkers);
        this.log(`Adding worker with key ${worker.triggerKey}, total=${keyWorkers.length}`);
        return worker;
    }
    getTriggerWorkers(triggerId) {
        return this.workers.get(this.getKey(triggerId)) || [];
    }
    setTriggerWorkers(triggerId, workers) {
        this.workers.set(this.getKey(triggerId), workers);
    }
    cleanUpWorkers() {
        // Drop all finished workers from the pool
        for (const [key, keyWorkers] of this.workers.entries()) {
            const notDoneWorkers = keyWorkers.filter((worker) => {
                return worker.state !== RuntimeWorkerState.FINISHED;
            });
            if (notDoneWorkers.length !== keyWorkers.length) {
                this.log(`Cleaned up workers for ${key}: ${keyWorkers.length} --> ${notDoneWorkers.length}`);
            }
            this.setTriggerWorkers(key, notDoneWorkers);
        }
    }
    log(msg) {
        emulatorLogger_1.EmulatorLogger.forEmulator(types_1.Emulators.FUNCTIONS).log("DEBUG", `[worker-pool] ${msg}`);
    }
}
exports.RuntimeWorkerPool = RuntimeWorkerPool;
//# sourceMappingURL=functionsRuntimeWorker.js.map