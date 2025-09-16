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
exports.Delegate = exports.tryCreateDelegate = void 0;
const os = __importStar(require("os"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const portfinder = __importStar(require("portfinder"));
const semver = __importStar(require("semver"));
const spawn = __importStar(require("cross-spawn"));
const node_fetch_1 = __importDefault(require("node-fetch"));
const error_1 = require("../../../../error");
const parseRuntimeAndValidateSDK_1 = require("./parseRuntimeAndValidateSDK");
const logger_1 = require("../../../../logger");
const utils_1 = require("../../../../utils");
const discovery = __importStar(require("../discovery"));
const supported = __importStar(require("../supported"));
const validate = __importStar(require("./validate"));
const versioning = __importStar(require("./versioning"));
const parseTriggers = __importStar(require("./parseTriggers"));
const fsutils_1 = require("../../../../fsutils");
// The versions of the Firebase Functions SDK that added support for the container contract.
const MIN_FUNCTIONS_SDK_VERSION = "3.20.0";
// The version of the Firebase Functions SDK that added support for the extensions annotation in the container contract.
const MIN_FUNCTIONS_SDK_VERSION_FOR_EXTENSIONS_FEATURES = "5.1.0";
/**
 *
 */
async function tryCreateDelegate(context) {
    const packageJsonPath = path.join(context.sourceDir, "package.json");
    try {
        await fs.promises.access(packageJsonPath);
    }
    catch {
        logger_1.logger.debug("Customer code is not Node");
        return undefined;
    }
    // Check what runtime to use, first in firebase.json, then in 'engines' field.
    // TODO: This method loads the Functions SDK version which is then manually loaded elsewhere.
    // We should find a way to refactor this code so we're not repeatedly invoking node.
    const runtime = (0, parseRuntimeAndValidateSDK_1.getRuntimeChoice)(context.sourceDir, context.runtime);
    if (!supported.runtimeIsLanguage(runtime, "nodejs")) {
        logger_1.logger.debug("Customer has a package.json but did not get a nodejs runtime. This should not happen");
        throw new error_1.FirebaseError(`Unexpected runtime ${runtime}`);
    }
    return new Delegate(context.projectId, context.projectDir, context.sourceDir, runtime);
}
exports.tryCreateDelegate = tryCreateDelegate;
// TODO(inlined): Consider moving contents in parseRuntimeAndValidateSDK and validate around.
// Those two files are currently pretty coupled (e.g. they borrow error messages from each other)
// and both files load package.json. Maybe the delegate should be constructed with a package.json and
// that can be passed to both methods.
class Delegate {
    constructor(projectId, projectDir, sourceDir, runtime) {
        this.projectId = projectId;
        this.projectDir = projectDir;
        this.sourceDir = sourceDir;
        this.runtime = runtime;
        this.language = "nodejs";
        // Using a caching interface because we (may/will) eventually depend on the SDK version
        // to decide whether to use the JS export method of discovery or the HTTP container contract
        // method of discovery.
        this._sdkVersion = undefined;
        this._bin = "";
    }
    get sdkVersion() {
        if (this._sdkVersion === undefined) {
            this._sdkVersion = versioning.getFunctionsSDKVersion(this.sourceDir) || "";
        }
        return this._sdkVersion;
    }
    get bin() {
        if (this._bin === "") {
            this._bin = this.getNodeBinary();
        }
        return this._bin;
    }
    getNodeBinary() {
        const requestedVersion = semver.coerce(this.runtime);
        if (!requestedVersion) {
            throw new error_1.FirebaseError(`Could not determine version of the requested runtime: ${this.runtime}`);
        }
        const hostVersion = process.versions.node;
        const localNodePath = path.join(this.sourceDir, "node_modules/node");
        const localNodeVersion = versioning.findModuleVersion("node", localNodePath);
        if (localNodeVersion) {
            if (semver.major(requestedVersion) === semver.major(localNodeVersion)) {
                (0, utils_1.logLabeledSuccess)("functions", `Using node@${semver.major(localNodeVersion)} from local cache.`);
                return localNodePath;
            }
        }
        if (semver.major(requestedVersion) === semver.major(hostVersion)) {
            (0, utils_1.logLabeledSuccess)("functions", `Using node@${semver.major(hostVersion)} from host.`);
            return process.execPath;
        }
        if (!process.env.FIREPIT_VERSION) {
            (0, utils_1.logLabeledWarning)("functions", `Your requested "node" version "${semver.major(requestedVersion)}" doesn't match your global version "${semver.major(hostVersion)}". Using node@${semver.major(hostVersion)} from host.`);
            return process.execPath;
        }
        // Otherwise we'll warn and use the version that is currently running this process.
        (0, utils_1.logLabeledWarning)("functions", `You've requested "node" version "${semver.major(requestedVersion)}", but the standalone Firebase CLI comes with bundled Node "${semver.major(hostVersion)}".`);
        (0, utils_1.logLabeledSuccess)("functions", `To use a different Node.js version, consider removing the standalone Firebase CLI and switching to "firebase-tools" on npm.`);
        return process.execPath;
    }
    validate() {
        versioning.checkFunctionsSDKVersion(this.sdkVersion);
        const relativeDir = path.relative(this.projectDir, this.sourceDir);
        validate.packageJsonIsValid(relativeDir, this.sourceDir, this.projectDir);
        return Promise.resolve();
    }
    async build() {
        // TODO: consider running npm build or tsc. This is currently redundant with predeploy hooks,
        // so we would need to detect and notify users that they can just use idiomatic options instead.
    }
    watch() {
        // TODO: consider running npm run watch if it is defined or tsc watch when tsconfig.json is present.
        return Promise.resolve(() => Promise.resolve());
    }
    findFunctionsBinary() {
        // Location of the binary included in the Firebase Functions SDK
        // differs depending on the developer's setup and choice of package manager.
        //
        // We'll try few routes in the following order:
        //
        //   1. $SOURCE_DIR/node_modules/.bin/firebase-functions
        //   2. $PROJECT_DIR/node_modules/.bin/firebase-functions
        //   3. node_modules closest to the resolved path ${require.resolve("firebase-functions")}
        //   4. (2) but ignore .pnpm directory
        //
        // (1) works for most package managers (npm, yarn[no-hoist]).
        // (2) works for some monorepo setup.
        // (3) handles cases where developer prefers monorepo setup or bundled function code.
        // (4) handles issue with some .pnpm setup (see https://github.com/firebase/firebase-tools/issues/5517)
        const sourceNodeModulesPath = path.join(this.sourceDir, "node_modules");
        const projectNodeModulesPath = path.join(this.projectDir, "node_modules");
        const sdkPath = require.resolve("firebase-functions", { paths: [this.sourceDir] });
        const sdkNodeModulesPath = sdkPath.substring(0, sdkPath.lastIndexOf("node_modules") + 12);
        const ignorePnpmModulesPath = sdkNodeModulesPath.replace(/\/\.pnpm\/.*/, "");
        for (const nodeModulesPath of [
            sourceNodeModulesPath,
            projectNodeModulesPath,
            sdkNodeModulesPath,
            ignorePnpmModulesPath,
        ]) {
            const binPath = path.join(nodeModulesPath, ".bin", "firebase-functions");
            if ((0, fsutils_1.fileExistsSync)(binPath)) {
                logger_1.logger.debug(`Found firebase-functions binary at '${binPath}'`);
                return binPath;
            }
        }
        throw new error_1.FirebaseError("Failed to find location of Firebase Functions SDK. " +
            "Please file a bug on Github (https://github.com/firebase/firebase-tools/).");
    }
    spawnFunctionsProcess(config, envs) {
        const env = {
            ...envs,
            FUNCTIONS_CONTROL_API: "true",
            HOME: process.env.HOME,
            PATH: process.env.PATH,
            NODE_ENV: process.env.NODE_ENV,
            // Web Frameworks fails without this environment variable
            __FIREBASE_FRAMEWORKS_ENTRY__: process.env.__FIREBASE_FRAMEWORKS_ENTRY__,
        };
        // Defensive check: config may come from external sources (e.g., API responses)
        // and could be null/undefined despite TypeScript types
        if (Object.keys(config || {}).length) {
            env.CLOUD_RUNTIME_CONFIG = JSON.stringify(config);
        }
        const binPath = this.findFunctionsBinary();
        const childProcess = spawn(binPath, [this.sourceDir], {
            env,
            cwd: this.sourceDir,
            stdio: [/* stdin=*/ "ignore", /* stdout=*/ "pipe", /* stderr=*/ "pipe"],
        });
        childProcess.stdout?.on("data", (chunk) => {
            logger_1.logger.info(chunk.toString("utf8"));
        });
        childProcess.stderr?.on("data", (chunk) => {
            logger_1.logger.error(chunk.toString("utf8"));
        });
        return childProcess;
    }
    /**
     * Executes the admin binary for file-based function discovery.
     * Sets the FUNCTIONS_MANIFEST_OUTPUT_PATH environment variable to tell
     * the SDK where to write the functions.yaml manifest file.
     */
    execAdmin(config, envs, manifestPath) {
        return this.spawnFunctionsProcess(config, {
            ...envs,
            FUNCTIONS_MANIFEST_OUTPUT_PATH: manifestPath,
        });
    }
    serveAdmin(config, envs, port) {
        const childProcess = this.spawnFunctionsProcess(config, { ...envs, PORT: port });
        // TODO: Refactor return type to () => Promise<void> to simplify nested promises
        return Promise.resolve(async () => {
            const p = new Promise((resolve, reject) => {
                childProcess.once("exit", resolve);
                childProcess.once("error", reject);
            });
            try {
                await (0, node_fetch_1.default)(`http://localhost:${port}/__/quitquitquit`);
            }
            catch (e) {
                logger_1.logger.debug("Failed to call quitquitquit. This often means the server failed to start", e);
            }
            setTimeout(() => {
                if (!childProcess.killed) {
                    childProcess.kill("SIGKILL");
                }
            }, 10000);
            return p;
        });
    }
    // eslint-disable-next-line require-await
    async discoverBuild(config, env) {
        if (!semver.valid(this.sdkVersion)) {
            logger_1.logger.debug(`Could not parse firebase-functions version '${this.sdkVersion}' into semver. Falling back to parseTriggers.`);
            return parseTriggers.discoverBuild(this.projectId, this.sourceDir, this.runtime, config, env);
        }
        if (semver.lt(this.sdkVersion, MIN_FUNCTIONS_SDK_VERSION)) {
            (0, utils_1.logLabeledWarning)("functions", `You are using an old version of firebase-functions SDK (${this.sdkVersion}). ` +
                `Please update firebase-functions SDK to >=${MIN_FUNCTIONS_SDK_VERSION}`);
            return parseTriggers.discoverBuild(this.projectId, this.sourceDir, this.runtime, config, env);
        }
        // Perform a check for the minimum SDK version that added annotation support for the `Build.extensions` property
        // and log to the user explaining why they need to upgrade their version.
        if (semver.lt(this.sdkVersion, MIN_FUNCTIONS_SDK_VERSION_FOR_EXTENSIONS_FEATURES)) {
            (0, utils_1.logLabeledBullet)("functions", `You are using a version of firebase-functions SDK (${this.sdkVersion}) that does not have support for the newest Firebase Extensions features. ` +
                `Please update firebase-functions SDK to >=${MIN_FUNCTIONS_SDK_VERSION_FOR_EXTENSIONS_FEATURES} to use them correctly`);
        }
        let discovered = await discovery.detectFromYaml(this.sourceDir, this.projectId, this.runtime);
        if (!discovered) {
            const discoveryPath = process.env.FIREBASE_FUNCTIONS_DISCOVERY_OUTPUT_PATH;
            if (!discoveryPath) {
                // HTTP-based discovery (default)
                const basePort = 8000 + (0, utils_1.randomInt)(0, 1000); // Add a jitter to reduce likelihood of race condition
                const port = await portfinder.getPortPromise({ port: basePort });
                const kill = await this.serveAdmin(config, env, port.toString());
                try {
                    discovered = await discovery.detectFromPort(port, this.projectId, this.runtime);
                }
                finally {
                    await kill();
                }
            }
            else if (discoveryPath === "true") {
                // File-based discovery with auto-generated temp directory
                const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "firebase-discovery-"));
                const manifestPath = path.join(tempDir, "functions.yaml");
                logger_1.logger.debug(`Writing functions discovery manifest to temporary file ${manifestPath}`);
                const childProcess = this.execAdmin(config, env, manifestPath);
                discovered = await discovery.detectFromOutputPath(childProcess, manifestPath, this.projectId, this.runtime);
            }
            else {
                // File-based discovery with user-specified directory
                const manifestPath = path.join(discoveryPath, "functions.yaml");
                logger_1.logger.debug(`Writing functions discovery manifest to ${manifestPath}`);
                const childProcess = this.execAdmin(config, env, manifestPath);
                discovered = await discovery.detectFromOutputPath(childProcess, manifestPath, this.projectId, this.runtime);
            }
        }
        return discovered;
    }
}
exports.Delegate = Delegate;
//# sourceMappingURL=index.js.map