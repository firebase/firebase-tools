"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.connect = exports.start = exports.stop = void 0;
const morgan = require("morgan");
const net_1 = require("net");
const superstatic_1 = require("superstatic");
const clc = require("colorette");
const detectProjectRoot_1 = require("../detectProjectRoot");
const error_1 = require("../error");
const implicitInit_1 = require("../hosting/implicitInit");
const initMiddleware_1 = require("../hosting/initMiddleware");
const config = require("../hosting/config");
const cloudRunProxy_1 = require("../hosting/cloudRunProxy");
const functionsProxy_1 = require("../hosting/functionsProxy");
const stream_1 = require("stream");
const emulatorLogger_1 = require("../emulator/emulatorLogger");
const types_1 = require("../emulator/types");
const utils_1 = require("../utils");
const requireHostingSite_1 = require("../requireHostingSite");
const projectUtils_1 = require("../projectUtils");
const portUtils_1 = require("../emulator/portUtils");
let destroyServer = undefined;
const logger = emulatorLogger_1.EmulatorLogger.forEmulator(types_1.Emulators.HOSTING);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function startServer(options, config, port, init) {
    const firebaseMiddleware = (0, initMiddleware_1.initMiddleware)(init);
    const morganStream = new stream_1.Writable();
    // eslint-disable-next-line @typescript-eslint/unbound-method
    morganStream._write = (chunk, encoding, callback) => {
        if (chunk instanceof Buffer) {
            logger.logLabeled("BULLET", "hosting", chunk.toString().trim());
        }
        callback();
    };
    const morganMiddleware = morgan("combined", {
        stream: morganStream,
    });
    const after = options.frameworksDevModeHandle && {
        files: options.frameworksDevModeHandle,
    };
    const server = (0, superstatic_1.server)({
        debug: false,
        port: port,
        hostname: options.host,
        config: config,
        compression: true,
        cwd: (0, detectProjectRoot_1.detectProjectRoot)(options) || undefined,
        stack: "strict",
        before: {
            files: (req, res, next) => {
                // We do these in a single method to ensure order of operations
                morganMiddleware(req, res, () => null);
                firebaseMiddleware(req, res, next);
            },
        },
        after,
        rewriters: {
            function: (0, functionsProxy_1.functionsProxy)(options),
            run: (0, cloudRunProxy_1.default)(options),
        },
    }).listen(() => {
        const siteName = config.target || config.site;
        const label = siteName ? "hosting[" + siteName + "]" : "hosting";
        if (config.public && config.public !== ".") {
            logger.logLabeled("BULLET", label, "Serving hosting files from: " + clc.bold(config.public));
        }
        logger.logLabeled("SUCCESS", label, "Local server: " + clc.underline(clc.bold("http://" + options.host + ":" + port)));
    });
    destroyServer = (0, utils_1.createDestroyer)(server);
    server.on("error", (err) => {
        logger.log("DEBUG", `Error from superstatic server: ${err.stack || ""}`);
        throw new error_1.FirebaseError(`An error occurred while starting the hosting development server:\n\n${err.message}`);
    });
}
/**
 * Stop the Hosting server.
 */
function stop() {
    return destroyServer ? destroyServer() : Promise.resolve();
}
exports.stop = stop;
/**
 * Start the Hosting server.
 * @param options the Firebase CLI options.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function start(options) {
    const init = await (0, implicitInit_1.implicitInit)(options);
    // N.B. Originally we didn't call this method because it could try to resolve
    // targets and cause us to fail. But we might be calling prepareFrameworks,
    // which modifies the cached result of config.hostingConfig. So if we don't
    // call this, we won't get web frameworks. But we might need to change this
    // as well to avoid validation errors.
    // But hostingConfig tries to resolve targets and a customer might not have
    // site/targets defined
    if (!options.site) {
        try {
            await (0, requireHostingSite_1.requireHostingSite)(options);
        }
        catch (_a) {
            if (init.json) {
                options.site = JSON.parse(init.json).projectId;
            }
            else {
                options.site = (0, projectUtils_1.getProjectId)(options) || "site";
            }
        }
    }
    const configs = config.hostingConfig(options);
    // We never want to try and take port 5001 because Functions likes that port
    // quite a bit, and we don't want to make Functions mad.
    const assignedPorts = new Set([5001]);
    for (let i = 0; i < configs.length; i++) {
        // skip over the functions emulator ports to avoid breaking changes
        let port = i === 0 ? options.port : options.port + 4 + i;
        while (assignedPorts.has(port) || !(await availablePort(options.host, port))) {
            port += 1;
        }
        assignedPorts.add(port);
        startServer(options, configs[i], port, init);
    }
    // We are not actually reserving 5001, so remove it from our set before
    // returning.
    assignedPorts.delete(5001);
    return { ports: Array.from(assignedPorts) };
}
exports.start = start;
/**
 * Connect the Hosting server.
 */
async function connect() {
    await Promise.resolve();
}
exports.connect = connect;
function availablePort(host, port) {
    return (0, portUtils_1.checkListenable)({
        address: host,
        port,
        family: (0, net_1.isIPv4)(host) ? "IPv4" : "IPv6",
    });
}
