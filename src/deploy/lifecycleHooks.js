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
exports.lifecycleHooks = void 0;
const utils = __importStar(require("../utils"));
const clc = __importStar(require("colorette"));
const childProcess = __importStar(require("child_process"));
const error_1 = require("../error");
const needProjectId = require("../projectUtils").needProjectId;
const logger_1 = require("../logger");
const path = __importStar(require("path"));
const vsCodeUtils_1 = require("../vsCodeUtils");
function runCommand(command, childOptions) {
    const escapedCommand = command.replace(/\"/g, '\\"');
    const nodeExecutable = (0, vsCodeUtils_1.isVSCodeExtension)() ? "node" : process.execPath;
    const crossEnvShellPath = (0, vsCodeUtils_1.isVSCodeExtension)()
        ? path.resolve(__dirname, "./cross-env/dist/bin/cross-env-shell.js")
        : path.resolve(require.resolve("cross-env"), "..", "bin", "cross-env-shell.js");
    const translatedCommand = '"' + nodeExecutable + '" "' + crossEnvShellPath + '" "' + escapedCommand + '"';
    return new Promise((resolve, reject) => {
        logger_1.logger.info("Running command: " + command);
        if (command.includes("=")) {
            utils.logWarning(clc.yellow(clc.bold("Warning: ")) +
                "Your command contains '=', it may result in the command not running." +
                " Please consider removing it.");
        }
        if (translatedCommand === "") {
            return resolve();
        }
        const child = childProcess.spawn(translatedCommand, [], childOptions);
        child.on("error", (err) => {
            reject(err);
        });
        child.on("exit", (code, signal) => {
            if (signal) {
                reject(new Error("Command terminated with signal " + signal));
            }
            else if (code !== 0) {
                reject(new Error("Command terminated with non-zero exit code " + code));
            }
            else {
                resolve();
            }
        });
    });
}
function getChildEnvironment(target, overallOptions, config) {
    // active project ID
    const projectId = needProjectId(overallOptions);
    // root directory where firebase.json can be found
    const projectDir = overallOptions.projectRoot;
    // location of hosting site or functions deploy, defaults project directory
    let resourceDir;
    switch (target) {
        case "hosting":
            resourceDir = overallOptions.config.path(config.public ?? config.source);
            break;
        case "functions":
            resourceDir = overallOptions.config.path(config.source);
            break;
        default:
            resourceDir = overallOptions.config.path(overallOptions.config.projectDir);
    }
    // Copying over environment variables
    return Object.assign({}, process.env, {
        GCLOUD_PROJECT: projectId,
        PROJECT_DIR: projectDir,
        RESOURCE_DIR: resourceDir,
    });
}
function runTargetCommands(target, hook, overallOptions, config) {
    let commands = config[hook];
    if (!commands) {
        return Promise.resolve();
    }
    if (typeof commands === "string") {
        commands = [commands];
    }
    const childOptions = {
        cwd: overallOptions.config.projectDir,
        env: getChildEnvironment(target, overallOptions, config),
        shell: true,
        stdio: [0, 1, 2], // Inherit STDIN, STDOUT, and STDERR
    };
    const runAllCommands = commands.reduce((soFar, command) => {
        return soFar.then(() => runCommand(command, childOptions));
    }, Promise.resolve());
    // We currently use the resource name in info logs in the rest of the deploy.
    // However we don't have access to that here because predeploy hooks will
    // happen before we figure that out.  Internal bug tracking number: 123715324
    let logIdentifier = target;
    if (config.target) {
        logIdentifier += `[${config.target}]`;
    }
    return runAllCommands
        .then(() => {
        utils.logSuccess(clc.green(clc.bold(logIdentifier + ":")) +
            " Finished running " +
            clc.bold(hook) +
            " script.");
    })
        .catch((err) => {
        throw new error_1.FirebaseError(logIdentifier + " " + hook + " error: " + err.message);
    });
}
function getReleventConfigs(target, options) {
    let targetConfigs = options.config.get(target);
    if (!targetConfigs) {
        return [];
    }
    if (!Array.isArray(targetConfigs)) {
        targetConfigs = [targetConfigs];
    }
    if (!options.only) {
        return targetConfigs;
    }
    let onlyTargets = options.only.split(",");
    if (onlyTargets.includes(target)) {
        return targetConfigs;
    }
    onlyTargets = onlyTargets
        .filter((individualOnly) => {
        return individualOnly.startsWith(`${target}:`);
    })
        .map((individualOnly) => {
        return individualOnly.replace(`${target}:`, "");
    });
    if (target === "functions") {
        let onlyConfigs = [];
        const matched = onlyTargets.reduce((matched, target) => ({ ...matched, [target]: false }), {});
        for (const config of targetConfigs) {
            if (!config.codebase) {
                onlyConfigs.push(config);
            }
            else {
                const found = onlyTargets.find((individualOnly) => config.codebase === individualOnly.split(":")[0]);
                if (found) {
                    onlyConfigs.push(config);
                    matched[found] = true;
                }
            }
        }
        // if there are --only targets that failed to match, we assume that the target is a
        // individually specified function and so we run lifecycle hooks for all codebases.
        // However, this also means that codebases or functions that don't exist will also run
        // the all codebase lifecycle hooks. Until we can significantly refactor the way we
        // identify which functions are in which codebase in the predeploy phase, we have to live
        // with this default behavior.
        if (!Object.values(matched).every((matched) => matched)) {
            onlyConfigs = targetConfigs;
        }
        return onlyConfigs;
    }
    else {
        return targetConfigs.filter((config) => {
            return !config.target || onlyTargets.includes(config.target);
        });
    }
}
function lifecycleHooks(target, hook) {
    return function (context, options) {
        return getReleventConfigs(target, options).reduce((previousCommands, individualConfig) => {
            return previousCommands.then(() => {
                return runTargetCommands(target, hook, options, individualConfig);
            });
        }, Promise.resolve());
    };
}
exports.lifecycleHooks = lifecycleHooks;
//# sourceMappingURL=lifecycleHooks.js.map