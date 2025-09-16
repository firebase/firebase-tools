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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Delegate = exports.getPythonBinary = exports.tryCreateDelegate = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const node_fetch_1 = __importDefault(require("node-fetch"));
const util_1 = require("util");
const portfinder = __importStar(require("portfinder"));
const discovery = __importStar(require("../discovery"));
const supported = __importStar(require("../supported"));
const logger_1 = require("../../../../logger");
const python_1 = require("../../../../functions/python");
const error_1 = require("../../../../error");
const functional_1 = require("../../../../functional");
/**
 * Create a runtime delegate for the Python runtime, if applicable.
 * @param context runtimes.DelegateContext
 * @return Delegate Python runtime delegate
 */
async function tryCreateDelegate(context) {
    const requirementsTextPath = path.join(context.sourceDir, "requirements.txt");
    if (!(await (0, util_1.promisify)(fs.exists)(requirementsTextPath))) {
        logger_1.logger.debug("Customer code is not Python code.");
        return;
    }
    const runtime = context.runtime ?? supported.latest("python");
    if (!supported.isRuntime(runtime)) {
        throw new error_1.FirebaseError(`Runtime ${runtime} is not a valid Python runtime`);
    }
    if (!supported.runtimeIsLanguage(runtime, "python")) {
        throw new error_1.FirebaseError(`Internal error. Trying to construct a python runtime delegate for runtime ${runtime}`, { exit: 1 });
    }
    return Promise.resolve(new Delegate(context.projectId, context.sourceDir, runtime));
}
exports.tryCreateDelegate = tryCreateDelegate;
/**
 * Get corresponding python binary name for a given runtime.
 *
 * By default, returns "python"
 */
function getPythonBinary(runtime) {
    if (process.platform === "win32") {
        // There is no easy way to get specific version of python executable in Windows.
        return "python.exe";
    }
    if (runtime === "python310") {
        return "python3.10";
    }
    else if (runtime === "python311") {
        return "python3.11";
    }
    else if (runtime === "python312") {
        return "python3.12";
    }
    else if (runtime === "python313") {
        return "python3.13";
    }
    (0, functional_1.assertExhaustive)(runtime, `Unhandled python runtime ${runtime}`);
}
exports.getPythonBinary = getPythonBinary;
class Delegate {
    constructor(projectId, sourceDir, runtime) {
        this.projectId = projectId;
        this.sourceDir = sourceDir;
        this.runtime = runtime;
        this.language = "python";
        this._bin = "";
        this._modulesDir = "";
    }
    get bin() {
        if (this._bin === "") {
            this._bin = this.getPythonBinary();
        }
        return this._bin;
    }
    async modulesDir() {
        if (!this._modulesDir) {
            let out = "";
            let stderr = "";
            const child = (0, python_1.runWithVirtualEnv)([
                this.bin,
                "-c",
                '"import firebase_functions; import os; print(os.path.dirname(firebase_functions.__file__))"',
            ], this.sourceDir, {});
            child.stderr?.on("data", (chunk) => {
                const chunkString = chunk.toString();
                stderr = stderr + chunkString;
                logger_1.logger.debug(`stderr: ${chunkString}`);
            });
            child.stdout?.on("data", (chunk) => {
                const chunkString = chunk.toString();
                out = out + chunkString;
                logger_1.logger.debug(`stdout: ${chunkString}`);
            });
            await new Promise((resolve, reject) => {
                child.on("exit", resolve);
                child.on("error", reject);
            });
            this._modulesDir = out.trim();
            if (this._modulesDir === "") {
                if (stderr.includes("venv") && stderr.includes("activate")) {
                    throw new error_1.FirebaseError("Failed to find location of Firebase Functions SDK: Missing virtual environment at venv directory. " +
                        `Did you forget to run '${this.bin} -m venv venv'?`);
                }
                const { command, args } = (0, python_1.virtualEnvCmd)(this.sourceDir, python_1.DEFAULT_VENV_DIR);
                throw new error_1.FirebaseError("Failed to find location of Firebase Functions SDK. " +
                    `Did you forget to run '${command} ${args.join(" ")} && ${this.bin} -m pip install -r requirements.txt'?`);
            }
        }
        return this._modulesDir;
    }
    getPythonBinary() {
        return getPythonBinary(this.runtime);
    }
    validate() {
        // TODO: make sure firebase-functions is included as a dep
        return Promise.resolve();
    }
    watch() {
        return Promise.resolve(() => Promise.resolve());
    }
    async build() {
        return Promise.resolve();
    }
    async serveAdmin(port, envs) {
        const modulesDir = await this.modulesDir();
        const envWithAdminPort = {
            ...envs,
            ADMIN_PORT: port.toString(),
        };
        const args = [this.bin, `"${path.join(modulesDir, "private", "serving.py")}"`];
        logger_1.logger.debug(`Running admin server with args: ${JSON.stringify(args)} and env: ${JSON.stringify(envWithAdminPort)} in ${this.sourceDir}`);
        const childProcess = (0, python_1.runWithVirtualEnv)(args, this.sourceDir, envWithAdminPort);
        childProcess.stdout?.on("data", (chunk) => {
            logger_1.logger.info(chunk.toString("utf8"));
        });
        childProcess.stderr?.on("data", (chunk) => {
            logger_1.logger.error(chunk.toString("utf8"));
        });
        return Promise.resolve(async () => {
            try {
                await (0, node_fetch_1.default)(`http://127.0.0.1:${port}/__/quitquitquit`);
            }
            catch (e) {
                logger_1.logger.debug("Failed to call quitquitquit. This often means the server failed to start", e);
            }
            const quitTimeout = setTimeout(() => {
                if (!childProcess.killed) {
                    childProcess.kill("SIGKILL");
                }
            }, 10000);
            clearTimeout(quitTimeout);
            return new Promise((resolve, reject) => {
                childProcess.once("exit", resolve);
                childProcess.once("error", reject);
            });
        });
    }
    async discoverBuild(_configValues, envs) {
        let discovered = await discovery.detectFromYaml(this.sourceDir, this.projectId, this.runtime);
        if (!discovered) {
            const adminPort = await portfinder.getPortPromise({
                port: 8081,
            });
            const killProcess = await this.serveAdmin(adminPort, envs);
            try {
                discovered = await discovery.detectFromPort(adminPort, this.projectId, this.runtime, 500 /* initialDelay, python startup is slow */);
            }
            finally {
                await killProcess();
            }
        }
        return discovered;
    }
}
exports.Delegate = Delegate;
//# sourceMappingURL=index.js.map