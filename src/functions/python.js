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
exports.runWithVirtualEnv = exports.virtualEnvCmd = exports.DEFAULT_VENV_DIR = void 0;
const path = __importStar(require("path"));
const spawn = __importStar(require("cross-spawn"));
const logger_1 = require("../logger");
const utils_1 = require("../utils");
/**
 * Default directory for python virtual environment.
 */
exports.DEFAULT_VENV_DIR = "venv";
/**
 *  Get command for running Python virtual environment for given platform.
 */
function virtualEnvCmd(cwd, venvDir) {
    const activateScriptPath = utils_1.IS_WINDOWS ? ["Scripts", "activate.bat"] : ["bin", "activate"];
    const venvActivate = `"${path.join(cwd, venvDir, ...activateScriptPath)}"`;
    return {
        command: utils_1.IS_WINDOWS ? venvActivate : ".",
        args: [utils_1.IS_WINDOWS ? "" : venvActivate],
    };
}
exports.virtualEnvCmd = virtualEnvCmd;
/**
 * Spawn a process inside the Python virtual environment if found.
 */
function runWithVirtualEnv(commandAndArgs, cwd, envs, spawnOpts = {}, venvDir = exports.DEFAULT_VENV_DIR) {
    const { command, args } = virtualEnvCmd(cwd, venvDir);
    args.push("&&", ...commandAndArgs);
    logger_1.logger.debug(`Running command with virtualenv: command=${command}, args=${JSON.stringify(args)}`);
    return spawn(command, args, {
        shell: true,
        cwd,
        stdio: [/* stdin= */ "pipe", /* stdout= */ "pipe", /* stderr= */ "pipe", "pipe"],
        ...spawnOpts,
        // Linting disabled since internal types expect NODE_ENV which does not apply to Python runtimes.
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
        env: envs,
    });
}
exports.runWithVirtualEnv = runWithVirtualEnv;
//# sourceMappingURL=python.js.map