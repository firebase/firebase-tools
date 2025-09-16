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
exports.spawnWithCommandString = exports.spawnWithOutput = exports.wrapSpawn = void 0;
const spawn = __importStar(require("cross-spawn"));
const logger_1 = require("../logger");
const error_1 = require("../error");
/**
 * wrapSpawn is cross platform spawn
 * @param cmd The command to run
 * @param args The args for the command
 * @param projectDir The current working directory to set
 */
function wrapSpawn(cmd, args, projectDir) {
    return new Promise((resolve, reject) => {
        const installer = spawn(cmd, args, {
            cwd: projectDir,
            stdio: "inherit",
            env: { ...process.env },
        });
        installer.on("error", (err) => {
            logger_1.logger.debug((0, error_1.getErrStack)(err));
        });
        installer.on("close", (code) => {
            if (code === 0) {
                return resolve();
            }
            return reject(new Error(`Error: spawn(${cmd}, [${args.join(", ")}]) \n exited with code: ${code || "null"}`));
        });
    });
}
exports.wrapSpawn = wrapSpawn;
/**
 * spawnWithOutput uses cross-spawn to spawn a child process and get
 * the output from it.
 * @param cmd The command to run
 * @param args The arguments for the command
 * @return The stdout string from the command.
 */
function spawnWithOutput(cmd, args) {
    return new Promise((resolve, reject) => {
        const child = spawn(cmd, args);
        let output = "";
        child.stdout?.on("data", (data) => {
            if ((0, error_1.isObject)(data) && data.toString) {
                output += data.toString();
            }
            else {
                output += JSON.stringify(data);
            }
        });
        child.stderr?.on("data", (data) => {
            logger_1.logger.debug(`Error: spawn(${cmd}, ${args.join(", ")})\n  Stderr:\n${JSON.stringify(data)}\n`);
        });
        child.on("error", (err) => {
            logger_1.logger.debug((0, error_1.getErrStack)(err));
        });
        child.on("close", (code) => {
            if (code === 0) {
                resolve(output);
            }
            else {
                reject(new Error(`Error: spawn(${cmd}, [${args.join(", ")}]) \n exited with code: ${code || "null"}`));
            }
        });
    });
}
exports.spawnWithOutput = spawnWithOutput;
/**
 * spawnWithCommandString spawns a child process with a command string
 * @param cmd The command to run
 * @param projectDir The directory to run it in
 * @param environmentVariables Environment variables to set
 */
function spawnWithCommandString(cmd, projectDir, environmentVariables) {
    return new Promise((resolve, reject) => {
        const installer = spawn(cmd, {
            cwd: projectDir,
            stdio: "inherit",
            shell: true,
            env: { ...process.env, ...environmentVariables },
        });
        installer.on("error", (err) => {
            logger_1.logger.log("DEBUG", (0, error_1.getErrStack)(err));
        });
        installer.on("close", (code) => {
            if (code === 0) {
                return resolve();
            }
            return reject(new Error(`Error: spawn(${cmd}) \n exited with code: ${code || "null"}`));
        });
    });
}
exports.spawnWithCommandString = spawnWithCommandString;
//# sourceMappingURL=spawn.js.map