"use strict";
/**
 * Start the App Hosting server.
 * @param options the Firebase CLI options.
 */
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
exports.getEmulatorEnvs = exports.start = void 0;
const net_1 = require("net");
const clc = __importStar(require("colorette"));
const portUtils_1 = require("../portUtils");
const developmentServer_1 = require("./developmentServer");
const constants_1 = require("../constants");
const spawn_1 = require("../../init/spawn");
const developmentServer_2 = require("./developmentServer");
const types_1 = require("../types");
const config_1 = require("./config");
const projectPath_1 = require("../../projectPath");
const registry_1 = require("../registry");
const env_1 = require("../env");
const error_1 = require("../../error");
const secrets = __importStar(require("../../gcp/secretManager"));
const utils_1 = require("../../utils");
const apphosting = __importStar(require("../../gcp/apphosting"));
const constants_2 = require("../constants");
const fetchWebSetup_1 = require("../../fetchWebSetup");
const apps_1 = require("../../management/apps");
const child_process_1 = require("child_process");
const semver_1 = require("semver");
/**
 * Spins up a project locally by running the project's dev command.
 *
 * Assumptions:
 *  - Dev server runs on "localhost" when the package manager's dev command is
 *    run
 *  - Dev server will respect the PORT environment variable
 */
async function start(options) {
    const hostname = constants_1.DEFAULT_HOST;
    let port = options?.port ?? constants_1.DEFAULT_PORTS.apphosting;
    while (!(await availablePort(hostname, port))) {
        port += 1;
    }
    await serve(options?.projectId, options?.backendId, port, options?.startCommand, options?.rootDirectory);
    return { hostname, port };
}
exports.start = start;
// Matches a fully qualified secret or version name, e.g.
// projects/my-project/secrets/my-secret/versions/1
// projects/my-project/secrets/my-secret/versions/latest
// projects/my-project/secrets/my-secret
const secretResourceRegex = /^projects\/([^/]+)\/secrets\/([^/]+)(?:\/versions\/((?:latest)|\d+))?$/;
// Matches a shorthand for a project-relative secret, with optional version, e.g.
// my-secret
// my-secret@1
// my-secret@latest
const secretShorthandRegex = /^([^/@]+)(?:@((?:latest)|\d+))?$/;
async function loadSecret(project, name) {
    let projectId;
    let secretId;
    let version;
    const match = secretResourceRegex.exec(name);
    if (match) {
        projectId = match[1];
        secretId = match[2];
        version = match[3] || "latest";
    }
    else {
        const match = secretShorthandRegex.exec(name);
        if (!match) {
            throw new error_1.FirebaseError(`Invalid secret name: ${name}`);
        }
        if (!project) {
            throw new error_1.FirebaseError(`Cannot load secret ${match[1]} without a project. ` +
                `Please use ${clc.bold("firebase use")} or pass the --project flag.`);
        }
        projectId = project;
        secretId = match[1];
        version = match[2] || "latest";
    }
    try {
        return await secrets.accessSecretVersion(projectId, secretId, version);
    }
    catch (err) {
        if (err?.original?.code === 403 || err?.original?.context?.response?.statusCode === 403) {
            (0, utils_1.logLabeledError)(types_1.Emulators.APPHOSTING, `Permission denied to access secret ${secretId}. Use ` +
                `${clc.bold("firebase apphosting:secrets:grantaccess")} to get permissions.`);
        }
        throw err;
    }
}
/**
 * Runs the development server in a child process.
 */
async function serve(projectId, backendId, port, startCommand, backendRelativeDir) {
    backendRelativeDir = backendRelativeDir ?? "./";
    const backendRoot = (0, projectPath_1.resolveProjectPath)({}, backendRelativeDir);
    const apphostingLocalConfig = await (0, config_1.getLocalAppHostingConfiguration)(backendRoot);
    const resolveEnv = Object.entries(apphostingLocalConfig.env).map(async ([key, value]) => [
        key,
        value.value ? value.value : await loadSecret(projectId, value.secret),
    ]);
    const environmentVariablesToInject = {
        NODE_ENV: process.env.NODE_ENV,
        ...getEmulatorEnvs(),
        ...Object.fromEntries(await Promise.all(resolveEnv)),
        FIREBASE_APP_HOSTING: "1",
        X_GOOGLE_TARGET_PLATFORM: "fah",
        GCLOUD_PROJECT: projectId,
        PROJECT_ID: projectId,
        PORT: port.toString(),
    };
    const packageManager = await (0, developmentServer_1.detectPackageManager)(backendRoot).catch(() => undefined);
    if (packageManager === "pnpm") {
        // TODO(jamesdaniels) look into pnpm support for autoinit
        (0, utils_1.logLabeledWarning)("apphosting", `Firebase JS SDK autoinit does not currently support PNPM.`);
    }
    else {
        const webappConfig = await getBackendAppConfig(projectId, backendId);
        if (webappConfig) {
            environmentVariablesToInject["FIREBASE_WEBAPP_CONFIG"] || (environmentVariablesToInject["FIREBASE_WEBAPP_CONFIG"] = JSON.stringify(webappConfig));
            environmentVariablesToInject["FIREBASE_CONFIG"] || (environmentVariablesToInject["FIREBASE_CONFIG"] = JSON.stringify({
                databaseURL: webappConfig.databaseURL,
                storageBucket: webappConfig.storageBucket,
                projectId: webappConfig.projectId,
            }));
        }
        await tripFirebasePostinstall(backendRoot, environmentVariablesToInject);
    }
    if (startCommand) {
        developmentServer_2.logger.logLabeled("BULLET", types_1.Emulators.APPHOSTING, `running custom start command: '${startCommand}'`);
        // NOTE: Development server should not block main emulator process.
        (0, spawn_1.spawnWithCommandString)(startCommand, backendRoot, environmentVariablesToInject)
            .catch((err) => {
            developmentServer_2.logger.logLabeled("ERROR", types_1.Emulators.APPHOSTING, `failed to start Dev Server: ${err}`);
        })
            .then(() => developmentServer_2.logger.logLabeled("BULLET", types_1.Emulators.APPHOSTING, `Dev Server stopped`));
        return;
    }
    const detectedStartCommand = await (0, developmentServer_1.detectStartCommand)(backendRoot);
    developmentServer_2.logger.logLabeled("BULLET", types_1.Emulators.APPHOSTING, `starting app with: '${detectedStartCommand}'`);
    // NOTE: Development server should not block main emulator process.
    (0, spawn_1.spawnWithCommandString)(detectedStartCommand, backendRoot, environmentVariablesToInject)
        .catch((err) => {
        developmentServer_2.logger.logLabeled("ERROR", types_1.Emulators.APPHOSTING, `failed to start Dev Server: ${err}`);
    })
        .then(() => developmentServer_2.logger.logLabeled("BULLET", types_1.Emulators.APPHOSTING, `Dev Server stopped`));
}
function availablePort(host, port) {
    return (0, portUtils_1.checkListenable)({
        address: host,
        port,
        family: (0, net_1.isIPv4)(host) ? "IPv4" : "IPv6",
    });
}
/**
 * Exported for unit tests
 */
function getEmulatorEnvs() {
    const envs = {};
    const emulatorInfos = registry_1.EmulatorRegistry.listRunningWithInfo().filter((emulator) => emulator.name !== types_1.Emulators.APPHOSTING);
    (0, env_1.setEnvVarsForEmulators)(envs, emulatorInfos);
    return envs;
}
exports.getEmulatorEnvs = getEmulatorEnvs;
async function tripFirebasePostinstall(rootDirectory, env) {
    const npmLs = (0, child_process_1.spawnSync)("npm", ["ls", "@firebase/util", "--json", "--long"], {
        cwd: rootDirectory,
        shell: process.platform === "win32",
    });
    if (!npmLs.stdout) {
        return;
    }
    const npmLsResults = JSON.parse(npmLs.stdout.toString().trim());
    const dependenciesToSearch = Object.values(npmLsResults.dependencies || {});
    const firebaseUtilPaths = [];
    for (const dependency of dependenciesToSearch) {
        if (dependency.name === "@firebase/util" &&
            (0, semver_1.gte)(dependency.version, "1.11.0") &&
            firebaseUtilPaths.indexOf(dependency.path) === -1) {
            firebaseUtilPaths.push(dependency.path);
        }
        if (dependency.dependencies) {
            dependenciesToSearch.push(...Object.values(dependency.dependencies));
        }
    }
    await Promise.all(firebaseUtilPaths.map((path) => new Promise((resolve) => {
        (0, child_process_1.spawnSync)("npm", ["run", "postinstall"], {
            cwd: path,
            env,
            stdio: "ignore",
            shell: process.platform === "win32",
        });
        resolve();
    })));
}
async function getBackendAppConfig(projectId, backendId) {
    if (!projectId) {
        return undefined;
    }
    if (constants_2.Constants.isDemoProject(projectId)) {
        return (0, fetchWebSetup_1.constructDefaultWebSetup)(projectId);
    }
    if (!backendId) {
        return undefined;
    }
    const backendsList = await apphosting.listBackends(projectId, "-").catch(() => undefined);
    const backend = backendsList?.backends.find((b) => apphosting.parseBackendName(b.name).id === backendId);
    if (!backend) {
        (0, utils_1.logLabeledWarning)("apphosting", `Unable to lookup details for backend ${backendId}. Firebase SDK autoinit will not be available.`);
        return undefined;
    }
    if (!backend.appId) {
        return undefined;
    }
    return (await (0, apps_1.getAppConfig)(backend.appId, apps_1.AppPlatform.WEB));
}
//# sourceMappingURL=serve.js.map