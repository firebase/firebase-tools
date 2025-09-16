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
exports.isIncomaptibleArchError = exports.start = exports.downloadIfNecessary = exports.stop = exports.getPID = exports.get = exports.getDownloadDetails = exports.requiresJava = exports.handleEmulatorProcessError = exports._getCommand = exports.getLogFileName = exports.DownloadDetails = void 0;
const lsofi = require("lsofi");
const types_1 = require("./types");
const constants_1 = require("./constants");
const error_1 = require("../error");
const childProcess = __importStar(require("child_process"));
const utils = __importStar(require("../utils"));
const emulatorLogger_1 = require("./emulatorLogger");
const clc = __importStar(require("colorette"));
const fs = __importStar(require("fs-extra"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const registry_1 = require("./registry");
const download_1 = require("../emulator/download");
const experiments = __importStar(require("../experiments"));
const process = __importStar(require("process"));
const emulatorUpdateDetails = __importStar(require("./downloadableEmulatorInfo.json"));
const EMULATOR_INSTANCE_KILL_TIMEOUT = 4000; /* ms */
const CACHE_DIR = process.env.FIREBASE_EMULATORS_PATH || path.join(os.homedir(), ".cache", "firebase", "emulators");
const EMULATOR_UPDATE_DETAILS = emulatorUpdateDetails;
const emulatorUiDetails = experiments.isEnabled("emulatoruisnapshot")
    ? EMULATOR_UPDATE_DETAILS.ui.snapshot
    : EMULATOR_UPDATE_DETAILS.ui.main;
const dataconnectDetails = process.platform === "darwin"
    ? EMULATOR_UPDATE_DETAILS.dataconnect.darwin
    : process.platform === "win32"
        ? EMULATOR_UPDATE_DETAILS.dataconnect.win32
        : EMULATOR_UPDATE_DETAILS.dataconnect.linux;
exports.DownloadDetails = {
    database: {
        downloadPath: path.join(CACHE_DIR, EMULATOR_UPDATE_DETAILS.database.downloadPathRelativeToCacheDir),
        version: EMULATOR_UPDATE_DETAILS.database.version,
        opts: {
            ...EMULATOR_UPDATE_DETAILS.database,
            cacheDir: CACHE_DIR,
            namePrefix: "firebase-database-emulator",
        },
    },
    firestore: {
        downloadPath: path.join(CACHE_DIR, EMULATOR_UPDATE_DETAILS.firestore.downloadPathRelativeToCacheDir),
        version: EMULATOR_UPDATE_DETAILS.firestore.version,
        opts: {
            ...EMULATOR_UPDATE_DETAILS.firestore,
            cacheDir: CACHE_DIR,
            namePrefix: "cloud-firestore-emulator",
        },
    },
    storage: {
        downloadPath: path.join(CACHE_DIR, EMULATOR_UPDATE_DETAILS.storage.downloadPathRelativeToCacheDir),
        version: EMULATOR_UPDATE_DETAILS.storage.version,
        opts: {
            ...EMULATOR_UPDATE_DETAILS.storage,
            cacheDir: CACHE_DIR,
            namePrefix: "cloud-storage-rules-emulator",
        },
    },
    ui: {
        version: emulatorUiDetails.version,
        downloadPath: path.join(CACHE_DIR, emulatorUiDetails.downloadPathRelativeToCacheDir),
        unzipDir: path.join(CACHE_DIR, `ui-v${emulatorUiDetails.version}`),
        binaryPath: path.join(CACHE_DIR, emulatorUiDetails.binaryPathRelativeToCacheDir),
        opts: {
            ...emulatorUiDetails,
            cacheDir: CACHE_DIR,
            skipCache: experiments.isEnabled("emulatoruisnapshot"),
            skipChecksumAndSize: experiments.isEnabled("emulatoruisnapshot"),
            namePrefix: "ui",
        },
    },
    pubsub: {
        downloadPath: path.join(CACHE_DIR, EMULATOR_UPDATE_DETAILS.pubsub.downloadPathRelativeToCacheDir),
        version: EMULATOR_UPDATE_DETAILS.pubsub.version,
        unzipDir: path.join(CACHE_DIR, `pubsub-emulator-${EMULATOR_UPDATE_DETAILS.pubsub.version}`),
        binaryPath: path.join(CACHE_DIR, EMULATOR_UPDATE_DETAILS.pubsub.binaryPathRelativeToCacheDir),
        opts: {
            ...EMULATOR_UPDATE_DETAILS.pubsub,
            cacheDir: CACHE_DIR,
            namePrefix: "pubsub-emulator",
        },
    },
    dataconnect: {
        downloadPath: path.join(CACHE_DIR, dataconnectDetails.downloadPathRelativeToCacheDir),
        version: dataconnectDetails.version,
        binaryPath: path.join(CACHE_DIR, dataconnectDetails.downloadPathRelativeToCacheDir),
        opts: {
            ...dataconnectDetails,
            cacheDir: CACHE_DIR,
            skipChecksumAndSize: false,
            namePrefix: "dataconnect-emulator",
            auth: false,
        },
    },
};
const EmulatorDetails = {
    database: {
        name: types_1.Emulators.DATABASE,
        instance: null,
        stdout: null,
    },
    firestore: {
        name: types_1.Emulators.FIRESTORE,
        instance: null,
        stdout: null,
    },
    storage: {
        name: types_1.Emulators.STORAGE,
        instance: null,
        stdout: null,
    },
    pubsub: {
        name: types_1.Emulators.PUBSUB,
        instance: null,
        stdout: null,
    },
    ui: {
        name: types_1.Emulators.UI,
        instance: null,
        stdout: null,
    },
    dataconnect: {
        name: types_1.Emulators.DATACONNECT,
        instance: null,
        stdout: null,
    },
};
const Commands = {
    database: {
        binary: "java",
        args: ["-Duser.language=en", "-jar", getExecPath(types_1.Emulators.DATABASE)],
        optionalArgs: [
            "port",
            "host",
            "functions_emulator_port",
            "functions_emulator_host",
            "single_project_mode",
        ],
        joinArgs: false,
        shell: false,
    },
    firestore: {
        binary: "java",
        args: [
            "-Dgoogle.cloud_firestore.debug_log_level=FINE",
            "-Duser.language=en",
            "-jar",
            getExecPath(types_1.Emulators.FIRESTORE),
        ],
        optionalArgs: [
            "port",
            "webchannel_port",
            "host",
            "rules",
            "websocket_port",
            "functions_emulator",
            "seed_from_export",
            "project_id",
            "single_project_mode",
            // TODO(christhompson) Re-enable after firestore accepts this flag.
            // "single_project_mode_error",
        ],
        joinArgs: false,
        shell: false,
    },
    storage: {
        // This is for the Storage Emulator rules runtime, which is started
        // separately in ./storage/runtime.ts (not via the start function below).
        binary: "java",
        args: [
            // Required for rules error/warning messages, which are in English only.
            // Attempts to fetch the messages in another language leads to crashes.
            "-Duser.language=en",
            "-jar",
            getExecPath(types_1.Emulators.STORAGE),
            "serve",
        ],
        optionalArgs: [],
        joinArgs: false,
        shell: false,
    },
    pubsub: {
        binary: `${getExecPath(types_1.Emulators.PUBSUB)}`,
        args: [],
        optionalArgs: ["port", "host"],
        joinArgs: true,
        shell: true,
    },
    ui: {
        binary: "",
        args: [],
        optionalArgs: [],
        joinArgs: false,
        shell: false,
    },
    dataconnect: {
        binary: `${getExecPath(types_1.Emulators.DATACONNECT)}`,
        args: ["--logtostderr", "-v=2", "dev"],
        optionalArgs: [
            "listen",
            "config_dir",
            "enable_output_schema_extensions",
            "enable_output_generated_sdk",
            // Additional flags that CLI shouldn't pass:
            // rpc_retry_count,
            // resolvers_emulator,
        ],
        joinArgs: true,
        shell: false,
    },
};
function getExecPath(name) {
    const details = getDownloadDetails(name);
    return details.binaryPath || details.downloadPath;
}
/**
 * @param name
 */
function getLogFileName(name) {
    return `${name}-debug.log`;
}
exports.getLogFileName = getLogFileName;
/**
 * Get a command to start the an emulator.
 * @param emulator - string identifier for the emulator to start.
 * @param args - map<string,string> of addittional args
 */
function _getCommand(emulator, args) {
    const baseCmd = Commands[emulator];
    const defaultPort = constants_1.Constants.getDefaultPort(emulator);
    if (!args.port) {
        args.port = defaultPort;
    }
    const cmdLineArgs = baseCmd.args.slice();
    if (baseCmd.binary === "java" &&
        utils.isRunningInWSL() &&
        (!args.host || !args.host.includes(":"))) {
        // HACK(https://github.com/firebase/firebase-tools-ui/issues/332): Force
        // Java to use IPv4 sockets in WSL (unless IPv6 address explicitly used).
        // Otherwise, Java will open a tcp6 socket (even if IPv4 address is used),
        // which handles both 4/6 on Linux but NOT IPv4 from the host to WSL.
        // This is a hack because it breaks all IPv6 connections as a side effect.
        // See: https://docs.oracle.com/javase/8/docs/api/java/net/doc-files/net-properties.html
        cmdLineArgs.unshift("-Djava.net.preferIPv4Stack=true"); // first argument
    }
    const logger = emulatorLogger_1.EmulatorLogger.forEmulator(emulator);
    Object.keys(args).forEach((key) => {
        if (!baseCmd.optionalArgs.includes(key)) {
            logger.log("DEBUG", `Ignoring unsupported arg: ${key}`);
            return;
        }
        const argKey = "--" + key;
        const argVal = args[key];
        if (argVal === undefined) {
            logger.log("DEBUG", `Ignoring empty arg for key: ${key}`);
            return;
        }
        // Sigh ... RTDB emulator needs "--arg val" and PubSub emulator needs "--arg=val"
        if (baseCmd.joinArgs) {
            cmdLineArgs.push(`${argKey}=${argVal}`);
        }
        else {
            cmdLineArgs.push(argKey, argVal);
        }
    });
    return {
        binary: baseCmd.binary,
        args: cmdLineArgs,
        optionalArgs: baseCmd.optionalArgs,
        joinArgs: baseCmd.joinArgs,
        shell: baseCmd.shell,
        port: args.port,
    };
}
exports._getCommand = _getCommand;
async function _fatal(emulator, errorMsg) {
    // if we do not issue a stopAll here and _fatal is called during startup, we could leave emulators running
    // that did start already
    // for example: JAVA_HOME=/does/not/exist firebase emulators:start
    try {
        const logger = emulatorLogger_1.EmulatorLogger.forEmulator(emulator);
        logger.logLabeled("WARN", emulator, `Fatal error occurred: \n   ${errorMsg}, \n   stopping all running emulators`);
        await registry_1.EmulatorRegistry.stopAll();
    }
    finally {
        process.exit(1);
    }
}
/**
 * Handle errors in an emulator process.
 */
async function handleEmulatorProcessError(emulator, err, port) {
    const description = constants_1.Constants.description(emulator);
    if (err.path === "java" && err.code === "ENOENT") {
        await _fatal(emulator, `${description} has exited because java is not installed, you can install it from https://openjdk.java.net/install/`);
    }
    else if (err.code === "EADDRINUSE") {
        const ps = port ? await lsofi(port) : false;
        await _fatal(emulator, `${description} has exited because its configured port is already in use${ps ? ` by process number ${ps}` : ""}. Are you running another copy of the emulator suite?`);
    }
    else {
        await _fatal(emulator, `${description} has exited: ${err}`);
    }
}
exports.handleEmulatorProcessError = handleEmulatorProcessError;
/**
 * Do the selected list of emulators depend on the JRE.
 */
function requiresJava(emulator) {
    if (emulator in Commands) {
        return Commands[emulator].binary === "java";
    }
    return false;
}
exports.requiresJava = requiresJava;
async function _runBinary(emulator, command, extraEnv) {
    return new Promise((resolve) => {
        const logger = emulatorLogger_1.EmulatorLogger.forEmulator(emulator.name);
        emulator.stdout = fs.createWriteStream(getLogFileName(emulator.name));
        try {
            const opts = {
                env: { ...process.env, ...extraEnv },
                // `detached` must be true as else a SIGINT (Ctrl-c) will stop the child process before we can handle a
                // graceful shutdown and call `downloadableEmulators.stop(...)` ourselves.
                // Note that it seems to be a problem with gRPC processes for which a fix may be found on the Java side
                // related to this issue: https://github.com/grpc/grpc-java/pull/6512
                detached: true,
                stdio: ["inherit", "pipe", "pipe"],
            };
            if (command.shell && utils.IS_WINDOWS) {
                opts.shell = true;
                if (command.binary.includes(" ")) {
                    command.binary = `"${command.binary}"`;
                }
            }
            emulator.instance = childProcess.spawn(command.binary, command.args, opts);
        }
        catch (e) {
            if (e.code === "EACCES") {
                // Known issue when WSL users don't have java
                // https://github.com/Microsoft/WSL/issues/3886
                logger.logLabeled("WARN", emulator.name, `Could not spawn child process for emulator, check that java is installed and on your $PATH.`);
            }
            else if (isIncomaptibleArchError(e)) {
                logger.logLabeled("WARN", emulator.name, `Unknown system error when starting emulator binary. ` +
                    `You may be able to fix this by installing Rosetta: ` +
                    `softwareupdate --install-rosetta`);
            }
            _fatal(emulator.name, e);
        }
        const description = constants_1.Constants.description(emulator.name);
        if (emulator.instance == null) {
            logger.logLabeled("WARN", emulator.name, `Could not spawn child process for ${description}.`);
            return;
        }
        logger.logLabeled("BULLET", emulator.name, `${description} logging to ${clc.bold(getLogFileName(emulator.name))}`);
        emulator.instance.stdout?.on("data", (data) => {
            logger.log("DEBUG", data.toString());
            emulator.stdout.write(data);
        });
        emulator.instance.stderr?.on("data", (data) => {
            logger.log("DEBUG", data.toString());
            emulator.stdout.write(data);
            if (data.toString().includes("java.lang.UnsupportedClassVersionError")) {
                logger.logLabeled("WARN", emulator.name, "Unsupported java version, make sure java --version reports 1.8 or higher.");
            }
            if (data.toString().includes("address already in use")) {
                const message = `${description} has exited because its configured port ${command.port} is already in use. Are you running another copy of the emulator suite?`;
                logger.logLabeled("ERROR", emulator.name, message);
            }
        });
        emulator.instance.on("error", (err) => {
            void handleEmulatorProcessError(emulator.name, err, command.port);
        });
        emulator.instance.once("exit", async (code, signal) => {
            if (signal) {
                utils.logWarning(`${description} has exited upon receiving signal: ${signal}`);
            }
            else if (code && code !== 0 && code !== /* SIGINT */ 130) {
                await _fatal(emulator.name, `${description} has exited with code: ${code}`);
            }
        });
        resolve();
    });
}
/**
 * @param emulator
 */
function getDownloadDetails(emulator) {
    const details = exports.DownloadDetails[emulator];
    const pathOverride = process.env[`${emulator.toUpperCase()}_EMULATOR_BINARY_PATH`];
    if (pathOverride) {
        const logger = emulatorLogger_1.EmulatorLogger.forEmulator(emulator);
        logger.logLabeled("WARN", emulator, `Env variable override detected. Using ${emulator} emulator at ${pathOverride}`);
        details.downloadPath = pathOverride;
        details.binaryPath = pathOverride;
        details.localOnly = true;
        fs.chmodSync(pathOverride, 0o755);
    }
    return details;
}
exports.getDownloadDetails = getDownloadDetails;
/**
 * @param emulator
 */
function get(emulator) {
    return EmulatorDetails[emulator];
}
exports.get = get;
/**
 * Returns the PID of the emulator process
 * @param emulator
 */
function getPID(emulator) {
    const emulatorInstance = get(emulator).instance;
    return emulatorInstance && emulatorInstance.pid ? emulatorInstance.pid : 0;
}
exports.getPID = getPID;
/**
 * @param targetName
 */
async function stop(targetName) {
    const emulator = get(targetName);
    return new Promise((resolve, reject) => {
        const logger = emulatorLogger_1.EmulatorLogger.forEmulator(emulator.name);
        // kill(0) does not end the process, it just checks for existence. See https://man7.org/linux/man-pages/man2/kill.2.html#:~:text=If%20sig%20is%200%2C%20
        if (emulator.instance && emulator.instance.kill(0)) {
            const killTimeout = setTimeout(() => {
                const pid = emulator.instance ? emulator.instance.pid : -1;
                const errorMsg = constants_1.Constants.description(emulator.name) + ": Unable to terminate process (PID=" + pid + ")";
                logger.log("DEBUG", errorMsg);
                reject(new error_1.FirebaseError(emulator.name + ": " + errorMsg));
            }, EMULATOR_INSTANCE_KILL_TIMEOUT);
            emulator.instance.once("exit", () => {
                clearTimeout(killTimeout);
                resolve();
            });
            emulator.instance.kill("SIGINT");
        }
        else {
            resolve();
        }
    });
}
exports.stop = stop;
/**
 * @param targetName
 */
async function downloadIfNecessary(targetName) {
    const hasEmulator = fs.existsSync(getExecPath(targetName));
    if (!hasEmulator) {
        await (0, download_1.downloadEmulator)(targetName);
    }
    return Commands[targetName];
}
exports.downloadIfNecessary = downloadIfNecessary;
/**
 * @param targetName
 * @param args
 * @param extraEnv
 */
async function start(targetName, args, extraEnv = {}) {
    const downloadDetails = getDownloadDetails(targetName);
    const emulator = get(targetName);
    const hasEmulator = fs.existsSync(getExecPath(targetName));
    const logger = emulatorLogger_1.EmulatorLogger.forEmulator(targetName);
    if (!hasEmulator || downloadDetails.opts.skipCache) {
        if (args.auto_download) {
            if (process.env.CI) {
                utils.logWarning(`It appears you are running in a CI environment. You can avoid downloading the ${constants_1.Constants.description(targetName)} repeatedly by caching the ${downloadDetails.opts.cacheDir} directory.`);
            }
            await (0, download_1.downloadEmulator)(targetName);
        }
        else {
            utils.logWarning("Setup required, please run: firebase setup:emulators:" + targetName);
            throw new error_1.FirebaseError("emulator not found");
        }
    }
    const command = _getCommand(targetName, args);
    logger.log("DEBUG", `Starting ${constants_1.Constants.description(targetName)} with command ${JSON.stringify(command)}`);
    return _runBinary(emulator, command, extraEnv);
}
exports.start = start;
function isIncomaptibleArchError(err) {
    return ((0, error_1.hasMessage)(err) &&
        /Unknown system error/.test(err.message ?? "") &&
        process.platform === "darwin");
}
exports.isIncomaptibleArchError = isIncomaptibleArchError;
//# sourceMappingURL=downloadableEmulators.js.map