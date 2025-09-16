"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.openInBrowserPopup = exports.openInBrowser = exports.connectableHostname = exports.randomInt = exports.debounce = exports.last = exports.cloneDeep = exports.groupBy = exports.assertIsStringOrUndefined = exports.assertIsNumber = exports.assertIsString = exports.thirtyDaysFromNow = exports.isRunningInWSL = exports.isCloudEnvironment = exports.datetimeString = exports.createDestroyer = exports.sleep = exports.promiseWithSpinner = exports.tryParse = exports.promiseProps = exports.withTimeout = exports.promiseWhile = exports.promiseAllSettled = exports.getFunctionsEventProvider = exports.endpoint = exports.makeActiveProject = exports.streamToString = exports.stringToStream = exports.explainStdin = exports.allSettled = exports.reject = exports.logLabeledError = exports.logLabeledWarning = exports.logWarningToStderr = exports.logWarning = exports.logLabeledBullet = exports.logBullet = exports.logLabeledSuccess = exports.logSuccess = exports.addSubdomain = exports.addDatabaseNamespace = exports.getDatabaseViewDataUrl = exports.getDatabaseUrl = exports.envOverride = exports.setVSCodeEnvVars = exports.getInheritedOption = exports.consoleUrl = exports.vscodeEnvVars = exports.envOverrides = exports.IS_WINDOWS = void 0;
exports.commandExistsSync = exports.newUniqueId = exports.deepEqual = exports.promptForDirectory = exports.updateOrCreateGitignore = exports.readSecretValue = exports.generatePassword = exports.generateId = exports.wrappedSafeLoad = exports.readFileFromDirectory = exports.getHostnameFromUrl = void 0;
const fs = require("fs-extra");
const tty = require("tty");
const path = require("node:path");
const yaml = require("yaml");
const crypto = require("node:crypto");
const _ = require("lodash");
const url = require("url");
const http = require("http");
const clc = require("colorette");
const open = require("open");
const ora = require("ora");
const process = require("process");
const stream_1 = require("stream");
const assert_1 = require("assert");
const portfinder_1 = require("portfinder");
const configstore_1 = require("./configstore");
const error_1 = require("./error");
const logger_1 = require("./logger");
const prompt_1 = require("./prompt");
const templates_1 = require("./templates");
const vsCodeUtils_1 = require("./vsCodeUtils");
const fsutils_1 = require("./fsutils");
const node_os_1 = require("node:os");
const node_child_process_1 = require("node:child_process");
exports.IS_WINDOWS = process.platform === "win32";
const SUCCESS_CHAR = exports.IS_WINDOWS ? "+" : "✔";
const WARNING_CHAR = exports.IS_WINDOWS ? "!" : "⚠";
const ERROR_CHAR = exports.IS_WINDOWS ? "!!" : "⬢";
const THIRTY_DAYS_IN_MILLISECONDS = 30 * 24 * 60 * 60 * 1000;
exports.envOverrides = [];
exports.vscodeEnvVars = {};
/**
 * Create a Firebase Console URL for the specified path and project.
 */
function consoleUrl(project, path) {
    const api = require("./api");
    return `${api.consoleOrigin()}/project/${project}${path}`;
}
exports.consoleUrl = consoleUrl;
/**
 * Trace up the ancestry of objects that have a `parent` key, finding the
 * first instance of the provided key.
 */
function getInheritedOption(options, key) {
    let target = options;
    while (target) {
        if (target[key] !== undefined) {
            return target[key];
        }
        target = target.parent;
    }
}
exports.getInheritedOption = getInheritedOption;
/**
 * Sets the VSCode environment variables to be used by the CLI when called by VSCode
 * @param envVar name of the environment variable
 * @param value value of the environment variable
 */
function setVSCodeEnvVars(envVar, value) {
    exports.vscodeEnvVars[envVar] = value;
}
exports.setVSCodeEnvVars = setVSCodeEnvVars;
/**
 * Override a value with supplied environment variable if present. A function
 * that returns the environment variable in an acceptable format can be
 * proivded. If it throws an error, the default value will be used.
 */
function envOverride(envname, value, coerce) {
    const currentEnvValue = (0, vsCodeUtils_1.isVSCodeExtension)() && exports.vscodeEnvVars[envname] ? exports.vscodeEnvVars[envname] : process.env[envname];
    if (currentEnvValue && currentEnvValue.length) {
        exports.envOverrides.push(envname);
        if (coerce) {
            try {
                return coerce(currentEnvValue, value);
            }
            catch (e) {
                return value;
            }
        }
        return currentEnvValue;
    }
    return value;
}
exports.envOverride = envOverride;
/**
 * Get the full URL to a path in the database or database emulator.
 */
function getDatabaseUrl(origin, namespace, pathname) {
    const withPath = url.resolve(origin, pathname);
    return addDatabaseNamespace(withPath, namespace);
}
exports.getDatabaseUrl = getDatabaseUrl;
/**
 * Get the URL to view data in the database or database emulator.
 *  - Prod: Firebase Console URL
 *  - Emulator: Localhost URL to a `.json` endpoint.
 */
function getDatabaseViewDataUrl(origin, project, namespace, pathname) {
    const urlObj = new url.URL(origin);
    if (urlObj.hostname.includes("firebaseio") || urlObj.hostname.includes("firebasedatabase")) {
        return consoleUrl(project, `/database/${namespace}/data${pathname}`);
    }
    // TODO(samstern): View in Emulator UI
    return getDatabaseUrl(origin, namespace, pathname + ".json");
}
exports.getDatabaseViewDataUrl = getDatabaseViewDataUrl;
/**
 * Add the namespace to a database or database emulator URL.
 *  - Prod: Add a subdomain.
 *  - Emulator: Add `?ns=` parameter.
 */
function addDatabaseNamespace(origin, namespace) {
    const urlObj = new url.URL(origin);
    if (urlObj.hostname.includes(namespace)) {
        return urlObj.href;
    }
    if (urlObj.hostname.includes("firebaseio") || urlObj.hostname.includes("firebasedatabase")) {
        return addSubdomain(origin, namespace);
    }
    urlObj.searchParams.set("ns", namespace);
    return urlObj.href;
}
exports.addDatabaseNamespace = addDatabaseNamespace;
/**
 * Add a subdomain to the specified HTTP origin.
 * (e.g. https://example.com -> https://sub.example.com)
 */
function addSubdomain(origin, subdomain) {
    return origin.replace("//", `//${subdomain}.`);
}
exports.addSubdomain = addSubdomain;
/**
 * Log an info statement with a green checkmark at the start of the line.
 */
function logSuccess(message, type = "info", data = undefined) {
    logger_1.logger[type](clc.green(clc.bold(`${SUCCESS_CHAR} `)), message, data);
}
exports.logSuccess = logSuccess;
/**
 * Log an info statement with a green checkmark at the start of the line.
 */
function logLabeledSuccess(label, message, type = "info", data = undefined) {
    logger_1.logger[type](clc.green(clc.bold(`${SUCCESS_CHAR}  ${label}:`)), message, data);
}
exports.logLabeledSuccess = logLabeledSuccess;
/**
 * Log an info statement with a gray bullet at the start of the line.
 */
function logBullet(message, type = "info", data = undefined) {
    logger_1.logger[type](clc.cyan(clc.bold("i ")), message, data);
}
exports.logBullet = logBullet;
/**
 * Log an info statement with a gray bullet at the start of the line.
 */
function logLabeledBullet(label, message, type = "info", data = undefined) {
    logger_1.logger[type](clc.cyan(clc.bold(`i  ${label}:`)), message, data);
}
exports.logLabeledBullet = logLabeledBullet;
/**
 * Log an info statement with a gray bullet at the start of the line.
 */
function logWarning(message, type = "warn", data = undefined) {
    logger_1.logger[type](clc.yellow(clc.bold(`${WARNING_CHAR} `)), message, data);
}
exports.logWarning = logWarning;
/**
 * Log a warning statement to stderr, regardless of logger configuration.
 */
function logWarningToStderr(message) {
    const prefix = clc.bold(`${WARNING_CHAR} `);
    process.stderr.write(clc.yellow(prefix + message) + "\n");
}
exports.logWarningToStderr = logWarningToStderr;
/**
 * Log an info statement with a gray bullet at the start of the line.
 */
function logLabeledWarning(label, message, type = "warn", data = undefined) {
    logger_1.logger[type](clc.yellow(clc.bold(`${WARNING_CHAR}  ${label}:`)), message, data);
}
exports.logLabeledWarning = logLabeledWarning;
/**
 * Log an error statement with a red bullet at the start of the line.
 */
function logLabeledError(label, message, type = "error", data = undefined) {
    logger_1.logger[type](clc.red(clc.bold(`${ERROR_CHAR}  ${label}:`)), message, data);
}
exports.logLabeledError = logLabeledError;
/**
 * Return a promise that rejects with a FirebaseError.
 */
function reject(message, options) {
    return Promise.reject(new error_1.FirebaseError(message, options));
}
exports.reject = reject;
/**
 * Polyfill for Promise.allSettled
 * TODO: delete once min Node version is 12.9.0 or greater
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function allSettled(promises) {
    if (!promises.length) {
        return Promise.resolve([]);
    }
    return new Promise((resolve) => {
        let remaining = promises.length;
        const results = [];
        for (let i = 0; i < promises.length; i++) {
            // N.B. We use the void operator to silence the linter that we have
            // a dangling promise (we are, after all, handling all failures).
            // We resolve the original promise so as not to crash when passed
            // a non-promise. This is part of the spec.
            void Promise.resolve(promises[i])
                .then((result) => {
                results[i] = {
                    status: "fulfilled",
                    value: result,
                };
            }, (err) => {
                results[i] = {
                    status: "rejected",
                    reason: err,
                };
            })
                .then(() => {
                if (!--remaining) {
                    resolve(results);
                }
            });
        }
    });
}
exports.allSettled = allSettled;
/**
 * Print out an explanatory message if a TTY is detected for how to manage STDIN
 */
function explainStdin() {
    if (exports.IS_WINDOWS) {
        throw new error_1.FirebaseError("STDIN input is not available on Windows.", {
            exit: 1,
        });
    }
    if (process.stdin.isTTY) {
        logger_1.logger.info(clc.bold("Note:"), "Reading STDIN. Type JSON data and then press Ctrl-D");
    }
}
exports.explainStdin = explainStdin;
/**
 * Converts text input to a Readable stream.
 * @param text string to turn into a stream.
 * @return Readable stream, or undefined if text is empty.
 */
function stringToStream(text) {
    if (!text) {
        return undefined;
    }
    const s = new stream_1.Readable();
    s.push(text);
    s.push(null);
    return s;
}
exports.stringToStream = stringToStream;
/**
 * Converts a Readable stream into a string.
 * @param s a readable stream.
 * @return a promise resolving to the string'd contents of the stream.
 */
function streamToString(s) {
    return new Promise((resolve, reject) => {
        let b = "";
        s.on("error", reject);
        s.on("data", (d) => (b += `${d}`));
        s.once("end", () => resolve(b));
    });
}
exports.streamToString = streamToString;
/**
 * Sets the active project alias or id in the specified directory.
 */
function makeActiveProject(projectDir, newActive) {
    const activeProjects = configstore_1.configstore.get("activeProjects") || {};
    if (newActive) {
        activeProjects[projectDir] = newActive;
    }
    else {
        _.unset(activeProjects, projectDir);
    }
    configstore_1.configstore.set("activeProjects", activeProjects);
}
exports.makeActiveProject = makeActiveProject;
/**
 * Creates API endpoint string, e.g. /v1/projects/pid/cloudfunctions
 */
function endpoint(parts) {
    return `/${parts.join("/")}`;
}
exports.endpoint = endpoint;
/**
 * Gets the event provider name for a Cloud Function from the trigger's
 * eventType string.
 */
function getFunctionsEventProvider(eventType) {
    // Legacy event types:
    const parts = eventType.split("/");
    if (parts.length > 1) {
        const provider = last(parts[1].split("."));
        return _.capitalize(provider);
    }
    // 1st gen event types:
    if (/google.*pubsub/.exec(eventType)) {
        return "PubSub";
    }
    else if (/google.storage/.exec(eventType)) {
        return "Storage";
    }
    else if (/google.analytics/.exec(eventType)) {
        return "Analytics";
    }
    else if (/google.firebase.database/.exec(eventType)) {
        return "Database";
    }
    else if (/google.firebase.auth/.exec(eventType)) {
        return "Auth";
    }
    else if (/google.firebase.crashlytics/.exec(eventType)) {
        return "Crashlytics";
    }
    else if (/google.*firestore/.exec(eventType)) {
        return "Firestore";
    }
    return _.capitalize(eventType.split(".")[1]);
}
exports.getFunctionsEventProvider = getFunctionsEventProvider;
/**
 * Returns a single Promise that is resolved when all the given promises have
 * either resolved or rejected.
 */
function promiseAllSettled(promises) {
    const wrappedPromises = promises.map(async (p) => {
        try {
            const val = await Promise.resolve(p);
            return { state: "fulfilled", value: val };
        }
        catch (err) {
            return { state: "rejected", reason: err };
        }
    });
    return Promise.all(wrappedPromises);
}
exports.promiseAllSettled = promiseAllSettled;
/**
 * Runs a given function (that returns a Promise) repeatedly while the given
 * sync check returns false. Resolves with the value that passed the check.
 */
async function promiseWhile(action, check, interval = 2500) {
    return new Promise((resolve, promiseReject) => {
        const run = async () => {
            try {
                const res = await action();
                if (check(res)) {
                    return resolve(res);
                }
                setTimeout(run, interval);
            }
            catch (err) {
                return promiseReject(err);
            }
        };
        run();
    });
}
exports.promiseWhile = promiseWhile;
/**
 * Return a promise that rejects after timeoutMs but otherwise behave the same.
 * @param timeoutMs the time in milliseconds before forced rejection
 * @param promise the original promise
 * @return a promise wrapping the original promise with rejection on timeout
 */
function withTimeout(timeoutMs, promise) {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("Timed out.")), timeoutMs);
        promise.then((value) => {
            clearTimeout(timeout);
            resolve(value);
        }, (err) => {
            clearTimeout(timeout);
            reject(err);
        });
    });
}
exports.withTimeout = withTimeout;
/**
 * Resolves all Promises at every key in the given object. If a value is not a
 * Promise, it is returned as-is.
 */
async function promiseProps(obj) {
    const resultObj = {};
    const promises = Object.keys(obj).map(async (key) => {
        const r = await Promise.resolve(obj[key]);
        resultObj[key] = r;
    });
    return Promise.all(promises).then(() => resultObj);
}
exports.promiseProps = promiseProps;
/**
 * Attempts to call JSON.parse on an object, if it throws return the original value
 * @param value
 */
function tryParse(value) {
    if (typeof value !== "string") {
        return value;
    }
    try {
        return JSON.parse(value);
    }
    catch (_a) {
        return value;
    }
}
exports.tryParse = tryParse;
/**
 * Runs a given function inside a spinner with a message
 */
async function promiseWithSpinner(action, message) {
    const spinner = ora(message).start();
    let data;
    try {
        data = await action();
        spinner.succeed();
    }
    catch (err) {
        spinner.fail();
        throw err;
    }
    return data;
}
exports.promiseWithSpinner = promiseWithSpinner;
/** Creates a promise that resolves after a given timeout. await to "sleep". */
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
exports.sleep = sleep;
/**
 * Return a "destroy" function for a Node.js HTTP server. MUST be called on
 * server creation (e.g. right after `.listen`), BEFORE any connections.
 *
 * Inspired by https://github.com/isaacs/server-destroy/blob/master/index.js
 * @return a function that destroys all connections and closes the server
 */
function createDestroyer(server) {
    const connections = new Set();
    server.on("connection", (conn) => {
        connections.add(conn);
        conn.once("close", () => connections.delete(conn));
    });
    // Make calling destroyer again just noop but return the same promise.
    let destroyPromise = undefined;
    return function destroyer() {
        if (!destroyPromise) {
            destroyPromise = new Promise((resolve, reject) => {
                server.close((err) => {
                    if (err)
                        return reject(err);
                    resolve();
                });
                connections.forEach((socket) => socket.destroy());
            });
        }
        return destroyPromise;
    };
}
exports.createDestroyer = createDestroyer;
/**
 * Returns the given date formatted as `YYYY-mm-dd HH:mm:ss`.
 * @param d the date to format.
 * @return the formatted date.
 */
function datetimeString(d) {
    const day = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, "0")}-${d
        .getDate()
        .toString()
        .padStart(2, "0")}`;
    const time = `${d.getHours().toString().padStart(2, "0")}:${d
        .getMinutes()
        .toString()
        .padStart(2, "0")}:${d.getSeconds().toString().padStart(2, "0")}`;
    return `${day} ${time}`;
}
exports.datetimeString = datetimeString;
/**
 * Indicates whether the end-user is running the CLI from a cloud-based environment.
 */
function isCloudEnvironment() {
    return !!process.env.CODESPACES || !!process.env.GOOGLE_CLOUD_WORKSTATIONS;
}
exports.isCloudEnvironment = isCloudEnvironment;
/**
 * Indicates whether or not this process is likely to be running in WSL.
 * @return true if we're likely in WSL, false otherwise
 */
function isRunningInWSL() {
    return !!process.env.WSL_DISTRO_NAME;
}
exports.isRunningInWSL = isRunningInWSL;
/**
 * Generates a date that is 30 days from Date.now()
 */
function thirtyDaysFromNow() {
    return new Date(Date.now() + THIRTY_DAYS_IN_MILLISECONDS);
}
exports.thirtyDaysFromNow = thirtyDaysFromNow;
/**
 * Verifies val is a string.
 */
function assertIsString(val, message) {
    if (typeof val !== "string") {
        throw new assert_1.AssertionError({
            message: message || `expected "string" but got "${typeof val}"`,
        });
    }
}
exports.assertIsString = assertIsString;
/**
 * Verifies val is a number.
 */
function assertIsNumber(val, message) {
    if (typeof val !== "number") {
        throw new assert_1.AssertionError({
            message: message || `expected "number" but got "${typeof val}"`,
        });
    }
}
exports.assertIsNumber = assertIsNumber;
/**
 * Assert val is a string or undefined.
 */
function assertIsStringOrUndefined(val, message) {
    if (!(val === undefined || typeof val === "string")) {
        throw new assert_1.AssertionError({
            message: message || `expected "string" or "undefined" but got "${typeof val}"`,
        });
    }
}
exports.assertIsStringOrUndefined = assertIsStringOrUndefined;
/**
 * Polyfill for groupBy.
 */
function groupBy(arr, f) {
    return arr.reduce((result, item) => {
        const key = f(item);
        if (result[key]) {
            result[key].push(item);
        }
        else {
            result[key] = [item];
        }
        return result;
    }, {});
}
exports.groupBy = groupBy;
function cloneArray(arr) {
    return arr.map((e) => cloneDeep(e));
}
function cloneObject(obj) {
    const clone = {};
    for (const [k, v] of Object.entries(obj)) {
        clone[k] = cloneDeep(v);
    }
    return clone;
}
/**
 * replacement for lodash cloneDeep that preserves type.
 */
// TODO: replace with builtin once Node 18 becomes the min version.
function cloneDeep(obj) {
    if (typeof obj !== "object" || !obj) {
        return obj;
    }
    if (obj instanceof RegExp) {
        return RegExp(obj, obj.flags);
    }
    if (obj instanceof Date) {
        return new Date(obj);
    }
    if (Array.isArray(obj)) {
        return cloneArray(obj);
    }
    if (obj instanceof Map) {
        return new Map(obj.entries());
    }
    return cloneObject(obj);
}
exports.cloneDeep = cloneDeep;
/**
 * Returns the last element in the array, or undefined if no array is passed or
 * the array is empty.
 */
function last(arr) {
    // The type system should never allow this, so return something that violates
    // the type system when passing in something that violates the type system.
    if (!Array.isArray(arr)) {
        return undefined;
    }
    return arr[arr.length - 1];
}
exports.last = last;
/**
 * Returns a function that delays invoking `fn` until `delay` ms have
 * passed since the last time `fn` was invoked.
 */
function debounce(fn, delay, { leading } = {}) {
    let timer;
    return (...args) => {
        if (!timer && leading) {
            fn(...args);
        }
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), delay);
    };
}
exports.debounce = debounce;
/**
 * Returns a random number between min and max, inclusive.
 */
function randomInt(min, max) {
    min = Math.floor(min);
    max = Math.ceil(max) + 1;
    return Math.floor(Math.random() * (max - min) + min);
}
exports.randomInt = randomInt;
/**
 * Return a connectable hostname, replacing wildcard 0.0.0.0 or :: with loopback
 * addresses 127.0.0.1 / ::1 correspondingly. See below for why this is needed:
 * https://github.com/firebase/firebase-tools-ui/issues/286
 *
 * This assumes that the consumer (i.e. client SDK, etc.) is located on the same
 * device as the Emulator hub (i.e. CLI), which may not be true on multi-device
 * setups, etc. In that case, the customer can work around this by specifying a
 * non-wildcard IP address (like the IP address on LAN, if accessing via LAN).
 */
function connectableHostname(hostname) {
    if (hostname === "0.0.0.0") {
        hostname = "127.0.0.1";
    }
    else if (hostname === "::" /* unquoted IPv6 wildcard */) {
        hostname = "::1";
    }
    else if (hostname === "[::]" /* quoted IPv6 wildcard */) {
        hostname = "[::1]";
    }
    return hostname;
}
exports.connectableHostname = connectableHostname;
/**
 * We wrap and export the open() function from the "open" package
 * to stub it out in unit tests.
 */
async function openInBrowser(url) {
    await open(url);
}
exports.openInBrowser = openInBrowser;
/**
 * Like openInBrowser but opens the url in a popup.
 */
async function openInBrowserPopup(url, buttonText) {
    const popupPage = (0, templates_1.readTemplateSync)("popup.html")
        .replace("${url}", url)
        .replace("${buttonText}", buttonText);
    const port = await (0, portfinder_1.getPortPromise)();
    const server = http.createServer((req, res) => {
        res.writeHead(200, {
            "Content-Length": popupPage.length,
            "Content-Type": "text/html",
        });
        res.end(popupPage);
        req.socket.destroy();
    });
    server.listen(port);
    const popupPageUri = `http://localhost:${port}`;
    await openInBrowser(popupPageUri);
    return {
        url: popupPageUri,
        cleanup: () => {
            server.close();
        },
    };
}
exports.openInBrowserPopup = openInBrowserPopup;
/**
 * Get hostname from a given url or null if the url is invalid
 */
function getHostnameFromUrl(url) {
    try {
        return new URL(url).hostname;
    }
    catch (e) {
        return null;
    }
}
exports.getHostnameFromUrl = getHostnameFromUrl;
/**
 * Retrieves a file from the directory.
 */
function readFileFromDirectory(directory, file) {
    return new Promise((resolve, reject) => {
        fs.readFile(path.resolve(directory, file), "utf8", (err, data) => {
            if (err) {
                if (err.code === "ENOENT") {
                    return reject(new error_1.FirebaseError(`Could not find "${file}" in "${directory}"`, { original: err }));
                }
                reject(new error_1.FirebaseError(`Failed to read file "${file}" in "${directory}"`, { original: err }));
            }
            else {
                resolve(data);
            }
        });
    }).then((source) => {
        return {
            source,
            sourceDirectory: directory,
        };
    });
}
exports.readFileFromDirectory = readFileFromDirectory;
/**
 * Wrapps `yaml.safeLoad` with an error handler to present better YAML parsing
 * errors.
 */
function wrappedSafeLoad(source) {
    try {
        return yaml.parse(source);
    }
    catch (err) {
        throw new error_1.FirebaseError(`YAML Error: ${(0, error_1.getErrMsg)(err)}`, { original: (0, error_1.getError)(err) });
    }
}
exports.wrappedSafeLoad = wrappedSafeLoad;
/**
 * Generate id meeting the following criterias:
 *  - Lowercase, digits, and hyphens only
 *  - Must begin with letter
 *  - Cannot end with hyphen
 */
function generateId(n = 6) {
    const letters = "abcdefghijklmnopqrstuvwxyz";
    const allChars = "01234567890-abcdefghijklmnopqrstuvwxyz";
    let id = letters[Math.floor(Math.random() * letters.length)];
    for (let i = 1; i < n; i++) {
        const idx = Math.floor(Math.random() * allChars.length);
        id += allChars[idx];
    }
    return id;
}
exports.generateId = generateId;
/**
 * Generate a password meeting the following criterias:
 *  - At least one lowercase, one uppercase, one number, and one special character.
 */
function generatePassword(n = 20) {
    const lower = "abcdefghijklmnopqrstuvwxyz";
    const upper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const numbers = "0123456789";
    const special = "!@#$%^&*()_+~`|}{[]:;?><,./-=";
    const all = lower + upper + numbers + special;
    let pw = "";
    pw += lower[crypto.randomInt(lower.length)];
    pw += upper[crypto.randomInt(upper.length)];
    pw += numbers[crypto.randomInt(numbers.length)];
    pw += special[crypto.randomInt(special.length)];
    for (let i = 4; i < n; i++) {
        pw += all[crypto.randomInt(all.length)];
    }
    // Shuffle the password to randomize character order using Fisher-Yates shuffle
    const pwArray = pw.split("");
    for (let i = pwArray.length - 1; i > 0; i--) {
        const j = crypto.randomInt(i);
        [pwArray[i], pwArray[j]] = [pwArray[j], pwArray[i]];
    }
    return pwArray.join("");
}
exports.generatePassword = generatePassword;
/**
 * Reads a secret value from either a file or a prompt.
 * If dataFile is falsy and this is a tty, uses prompty. Otherwise reads from dataFile.
 * If dataFile is - or falsy, this means reading from file descriptor 0 (e.g. pipe in)
 */
function readSecretValue(prompt, dataFile) {
    if ((!dataFile || dataFile === "-") && tty.isatty(0)) {
        return (0, prompt_1.password)({ message: prompt });
    }
    let input = 0;
    if (dataFile && dataFile !== "-") {
        input = dataFile;
    }
    try {
        return Promise.resolve(fs.readFileSync(input, "utf-8"));
    }
    catch (e) {
        if (e.code === "ENOENT") {
            throw new error_1.FirebaseError(`File not found: ${input}`, { original: e });
        }
        throw e;
    }
}
exports.readSecretValue = readSecretValue;
/**
 * Updates or creates a .gitignore file with the given entries in the given path
 */
function updateOrCreateGitignore(dirPath, entries) {
    const gitignorePath = path.join(dirPath, ".gitignore");
    if (!fs.existsSync(gitignorePath)) {
        fs.writeFileSync(gitignorePath, entries.join("\n"));
        return;
    }
    let content = fs.readFileSync(gitignorePath, "utf-8");
    for (const entry of entries) {
        if (!content.includes(entry)) {
            content += `\n${entry}\n`;
        }
    }
    fs.writeFileSync(gitignorePath, content);
}
exports.updateOrCreateGitignore = updateOrCreateGitignore;
/**
 * Prompts for a directory name, and reprompts if that path does not exist
 * N.B. Moved from the original prompt library to this file because it brings in a lot of
 * dependencies. Moved to "utils" because this file arleady brings in the world.
 */
async function promptForDirectory(args) {
    let dir = "";
    while (!dir) {
        const promptPath = await (0, prompt_1.input)(args.message);
        let target;
        if (args.relativeTo) {
            target = path.resolve(args.relativeTo, promptPath);
        }
        else {
            target = args.config.path(promptPath);
        }
        if ((0, fsutils_1.fileExistsSync)(target)) {
            logger_1.logger.error(`Expected a directory, but ${target} is a file. Please provide a path to a directory.`);
        }
        else if (!(0, fsutils_1.dirExistsSync)(target)) {
            logger_1.logger.error(`Directory ${target} not found. Please provide a path to a directory`);
        }
        else {
            dir = target;
        }
    }
    return dir;
}
exports.promptForDirectory = promptForDirectory;
/*
 * Deeply compares two JSON-serializable objects.
 * It's a simplified version of a deep equal function, sufficient for comparing the structure
 * of the gemini-extension.json file. It doesn't handle special cases like RegExp, Date, or functions.
 */
function deepEqual(a, b) {
    if (a === b) {
        return true;
    }
    if (typeof a !== "object" || a === null || typeof b !== "object" || b === null) {
        return false;
    }
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) {
        return false;
    }
    for (const key of keysA) {
        if (!keysB.includes(key) || !deepEqual(a[key], b[key])) {
            return false;
        }
    }
    return true;
}
exports.deepEqual = deepEqual;
/**
 * Returns a unique ID that's either `recommended` or `recommended-{i}`.
 * Avoid existing IDs.
 */
function newUniqueId(recommended, existingIDs) {
    let id = recommended;
    let i = 1;
    while (existingIDs.includes(id)) {
        id = `${recommended}-${i}`;
        i++;
    }
    return id;
}
exports.newUniqueId = newUniqueId;
/**
 * Checks if a command exists in the system.
 */
function commandExistsSync(command) {
    try {
        const isWindows = (0, node_os_1.platform)() === "win32";
        // For Windows, `where` is more appropriate. It also often outputs the path.
        // For Unix-like systems, `which` is standard.
        // The `2> nul` (Windows) or `2>/dev/null` (Unix) redirects stderr to suppress error messages.
        // The `>` nul / `>/dev/null` redirects stdout as we only care about the exit code.
        const commandToCheck = isWindows
            ? `where "${command}" > nul 2> nul`
            : `which "${command}" > /dev/null 2> /dev/null`;
        (0, node_child_process_1.execSync)(commandToCheck);
        return true; // If execSync doesn't throw, the command was found (exit code 0)
    }
    catch (error) {
        // If the command is not found, execSync will throw an error (non-zero exit code)
        return false;
    }
}
exports.commandExistsSync = commandExistsSync;
