"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Severity = exports.EmulatorLog = exports.FunctionsExecutionMode = exports.isEmulator = exports.isDownloadableEmulator = exports.ALL_EMULATORS = exports.EMULATORS_SUPPORTED_BY_USE_EMULATOR = exports.EMULATORS_SUPPORTED_BY_UI = exports.EMULATORS_SUPPORTED_BY_FUNCTIONS = exports.ALL_SERVICE_EMULATORS = exports.IMPORT_EXPORT_EMULATORS = exports.DOWNLOADABLE_EMULATORS = exports.Emulators = void 0;
var Emulators;
(function (Emulators) {
    Emulators["AUTH"] = "auth";
    Emulators["HUB"] = "hub";
    Emulators["FUNCTIONS"] = "functions";
    Emulators["FIRESTORE"] = "firestore";
    Emulators["DATABASE"] = "database";
    Emulators["HOSTING"] = "hosting";
    Emulators["APPHOSTING"] = "apphosting";
    Emulators["PUBSUB"] = "pubsub";
    Emulators["UI"] = "ui";
    Emulators["LOGGING"] = "logging";
    Emulators["STORAGE"] = "storage";
    Emulators["EXTENSIONS"] = "extensions";
    Emulators["EVENTARC"] = "eventarc";
    Emulators["DATACONNECT"] = "dataconnect";
    Emulators["TASKS"] = "tasks";
})(Emulators = exports.Emulators || (exports.Emulators = {}));
exports.DOWNLOADABLE_EMULATORS = [
    Emulators.FIRESTORE,
    Emulators.DATABASE,
    Emulators.PUBSUB,
    Emulators.UI,
    Emulators.STORAGE,
    Emulators.DATACONNECT,
];
exports.IMPORT_EXPORT_EMULATORS = [
    Emulators.FIRESTORE,
    Emulators.DATABASE,
    Emulators.AUTH,
    Emulators.STORAGE,
    Emulators.DATACONNECT,
];
exports.ALL_SERVICE_EMULATORS = [
    Emulators.APPHOSTING,
    Emulators.AUTH,
    Emulators.FUNCTIONS,
    Emulators.FIRESTORE,
    Emulators.DATABASE,
    Emulators.HOSTING,
    Emulators.PUBSUB,
    Emulators.STORAGE,
    Emulators.EVENTARC,
    Emulators.DATACONNECT,
    Emulators.TASKS,
].filter((v) => v);
exports.EMULATORS_SUPPORTED_BY_FUNCTIONS = [
    Emulators.FIRESTORE,
    Emulators.DATABASE,
    Emulators.PUBSUB,
    Emulators.STORAGE,
    Emulators.EVENTARC,
    Emulators.TASKS,
];
exports.EMULATORS_SUPPORTED_BY_UI = [
    Emulators.AUTH,
    Emulators.DATABASE,
    Emulators.FIRESTORE,
    Emulators.FUNCTIONS,
    Emulators.STORAGE,
    Emulators.EXTENSIONS,
];
exports.EMULATORS_SUPPORTED_BY_USE_EMULATOR = [
    Emulators.AUTH,
    Emulators.DATABASE,
    Emulators.FIRESTORE,
    Emulators.FUNCTIONS,
    Emulators.STORAGE,
];
// TODO: Is there a way we can just allow iteration over the enum?
exports.ALL_EMULATORS = [
    Emulators.HUB,
    Emulators.UI,
    Emulators.LOGGING,
    Emulators.EXTENSIONS,
    ...exports.ALL_SERVICE_EMULATORS,
];
/**
 * @param value
 */
function isDownloadableEmulator(value) {
    return isEmulator(value) && exports.DOWNLOADABLE_EMULATORS.includes(value);
}
exports.isDownloadableEmulator = isDownloadableEmulator;
/**
 * @param value
 */
function isEmulator(value) {
    return Object.values(Emulators).includes(value);
}
exports.isEmulator = isEmulator;
var FunctionsExecutionMode;
(function (FunctionsExecutionMode) {
    // Function workers will be spawned as needed with no particular
    // guarantees.
    FunctionsExecutionMode["AUTO"] = "auto";
    // All function executions will be run sequentially in a single worker.
    FunctionsExecutionMode["SEQUENTIAL"] = "sequential";
})(FunctionsExecutionMode = exports.FunctionsExecutionMode || (exports.FunctionsExecutionMode = {}));
class EmulatorLog {
    get date() {
        if (!this.timestamp) {
            return new Date(0);
        }
        return new Date(this.timestamp);
    }
    static waitForFlush() {
        return new Promise((resolve) => {
            const interval = setInterval(() => {
                if (!EmulatorLog.WAITING_FOR_FLUSH) {
                    resolve();
                    clearInterval(interval);
                }
            }, 10);
        });
    }
    static waitForLog(emitter, level, type, filter) {
        return new Promise((resolve) => {
            const listener = (el) => {
                const levelTypeMatch = el.level === level && el.type === type;
                let filterMatch = true;
                if (filter) {
                    filterMatch = filter(el);
                }
                if (levelTypeMatch && filterMatch) {
                    emitter.removeListener("log", listener);
                    resolve(el);
                }
            };
            emitter.on("log", listener);
        });
    }
    static fromJSON(json) {
        let parsedLog;
        let isNotJSON = false;
        try {
            parsedLog = JSON.parse(json);
        }
        catch (err) {
            isNotJSON = true;
        }
        parsedLog = parsedLog || {};
        if (isNotJSON ||
            parsedLog.level === undefined ||
            parsedLog.type === undefined ||
            parsedLog.text === undefined) {
            parsedLog = {
                level: "USER",
                type: "function-log",
                text: json,
            };
        }
        return new EmulatorLog(parsedLog.level, parsedLog.type, parsedLog.text, parsedLog.data, parsedLog.timestamp);
    }
    constructor(level, type, text, data, timestamp) {
        this.level = level;
        this.type = type;
        this.text = text;
        this.data = data;
        this.timestamp = timestamp;
        this.timestamp = this.timestamp || new Date().toISOString();
        this.data = this.data || {};
    }
    toString() {
        return this.toStringCore(false);
    }
    toPrettyString() {
        return this.toStringCore(true);
    }
    /**
     * We use a global boolean to know if all of our messages have been flushed, and the functions
     * emulator can wait on this variable to flip before exiting. This ensures that we never
     * miss a log message that has been queued but has not yet flushed.
     */
    log() {
        const msg = `${this.toString()}\n`;
        this.bufferMessage(msg);
        this.flush();
    }
    bufferMessage(msg) {
        EmulatorLog.LOG_BUFFER.push(msg);
    }
    flush() {
        const nextMsg = EmulatorLog.LOG_BUFFER.shift();
        if (!nextMsg) {
            return;
        }
        EmulatorLog.WAITING_FOR_FLUSH = true;
        if (process.send) {
            // For some reason our node.d.ts file does not include the version of subprocess.send() with a callback
            // but the node docs assert that it has an optional callback.
            // https://nodejs.org/api/child_process.html#child_process_subprocess_send_message_sendhandle_options_callback
            process.send(nextMsg, undefined, {}, (err) => {
                if (err) {
                    process.stderr.write(err);
                }
                EmulatorLog.WAITING_FOR_FLUSH = EmulatorLog.LOG_BUFFER.length > 0;
                this.flush();
            });
        }
        else {
            process.stderr.write("subprocess.send() is undefined, cannot communicate with Functions Runtime.");
        }
    }
    toStringCore(pretty = false) {
        return JSON.stringify({
            timestamp: this.timestamp,
            level: this.level,
            text: this.text,
            data: this.data,
            type: this.type,
        }, undefined, pretty ? 2 : 0);
    }
}
exports.EmulatorLog = EmulatorLog;
EmulatorLog.WAITING_FOR_FLUSH = false;
EmulatorLog.LOG_BUFFER = [];
var Severity;
(function (Severity) {
    Severity[Severity["SEVERITY_UNSPECIFIED"] = 0] = "SEVERITY_UNSPECIFIED";
    Severity[Severity["DEPRECATION"] = 1] = "DEPRECATION";
    Severity[Severity["WARNING"] = 2] = "WARNING";
    Severity[Severity["ERROR"] = 3] = "ERROR";
})(Severity = exports.Severity || (exports.Severity = {}));
//# sourceMappingURL=types.js.map