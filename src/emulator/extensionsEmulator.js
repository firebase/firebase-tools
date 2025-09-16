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
exports.ExtensionsEmulator = void 0;
const clc = __importStar(require("colorette"));
const spawn = __importStar(require("cross-spawn"));
const fs = __importStar(require("fs-extra"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const Table = __importStar(require("cli-table3"));
const planner = __importStar(require("../deploy/extensions/planner"));
const ensureApiEnabled_1 = require("../ensureApiEnabled");
const error_1 = require("../error");
const optionsHelper_1 = require("../extensions/emulator/optionsHelper");
const refs_1 = require("../extensions/refs");
const shortenUrl_1 = require("../shortenUrl");
const constants_1 = require("./constants");
const download_1 = require("./download");
const emulatorLogger_1 = require("./emulatorLogger");
const validation_1 = require("./extensions/validation");
const registry_1 = require("./registry");
const types_1 = require("./types");
const common_1 = require("../extensions/runtimes/common");
const paramHelper_1 = require("../extensions/paramHelper");
class ExtensionsEmulator {
    constructor(args) {
        this.want = [];
        this.wantDynamic = {};
        this.backends = [];
        this.staticBackends = [];
        this.dynamicBackends = {};
        this.logger = emulatorLogger_1.EmulatorLogger.forEmulator(types_1.Emulators.EXTENSIONS);
        // Keeps track of all the extension sources that are being downloaded.
        this.pendingDownloads = new Map();
        this.args = args;
    }
    start() {
        this.logger.logLabeled("DEBUG", "Extensions", "Started Extensions emulator, this is a noop.");
        return Promise.resolve();
    }
    stop() {
        this.logger.logLabeled("DEBUG", "Extensions", "Stopping Extensions emulator, this is a noop.");
        return Promise.resolve();
    }
    connect() {
        this.logger.logLabeled("DEBUG", "Extensions", "Connecting Extensions emulator, this is a noop.");
        return Promise.resolve();
    }
    getInfo() {
        const functionsEmulator = registry_1.EmulatorRegistry.get(types_1.Emulators.FUNCTIONS);
        if (!functionsEmulator) {
            throw new error_1.FirebaseError("Extensions Emulator is running but Functions emulator is not. This should never happen.");
        }
        return { ...functionsEmulator.getInfo(), name: this.getName() };
    }
    getName() {
        return types_1.Emulators.EXTENSIONS;
    }
    // readManifest checks the `extensions` section of `firebase.json` for the extension instances to emulate,
    // and the `{projectRoot}/extensions` directory for param values.
    async readManifest() {
        this.want = await planner.want({
            projectId: this.args.projectId,
            projectNumber: this.args.projectNumber,
            aliases: this.args.aliases ?? [],
            projectDir: this.args.projectDir,
            extensions: this.args.extensions,
            emulatorMode: true,
        });
    }
    // ensureSourceCode checks the cache for the source code for a given extension version,
    // downloads and builds it if it is not found, then returns the path to that source code.
    async ensureSourceCode(instance) {
        if (instance.localPath) {
            if (!this.hasValidSource({ path: instance.localPath, extTarget: instance.localPath })) {
                throw new error_1.FirebaseError(`Tried to emulate local extension at ${instance.localPath}, but it was missing required files.`);
            }
            return path.resolve(instance.localPath);
        }
        else if (instance.ref) {
            const ref = (0, refs_1.toExtensionVersionRef)(instance.ref);
            const cacheDir = process.env.FIREBASE_EXTENSIONS_CACHE_PATH ||
                path.join(os.homedir(), ".cache", "firebase", "extensions");
            const sourceCodePath = path.join(cacheDir, ref);
            // Wait for previous download promise to resolve before we check source validity.
            // This avoids racing to download the same source multiple times.
            // Note: The below will not work because it throws the thread to the back of the message queue.
            // await (this.pendingDownloads.get(ref) ?? Promise.resolve());
            if (this.pendingDownloads.get(ref)) {
                await this.pendingDownloads.get(ref);
            }
            if (!this.hasValidSource({ path: sourceCodePath, extTarget: ref })) {
                const promise = this.downloadSource(instance, ref, sourceCodePath);
                this.pendingDownloads.set(ref, promise);
                await promise;
            }
            return sourceCodePath;
        }
        else {
            throw new error_1.FirebaseError("Tried to emulate an extension instance without a ref or localPath. This should never happen.");
        }
    }
    async downloadSource(instance, ref, sourceCodePath) {
        const extensionVersion = await planner.getExtensionVersion(instance);
        await (0, download_1.downloadExtensionVersion)(ref, extensionVersion.sourceDownloadUri, sourceCodePath);
        this.installAndBuildSourceCode(sourceCodePath);
    }
    /**
     * Returns if the source code at given path is valid.
     *
     * Checks against a list of required files or directories that need to be present.
     */
    hasValidSource(args) {
        // TODO(lihes): Source code can technically exist in other than "functions" dir.
        // https://source.corp.google.com/piper///depot/google3/firebase/mods/go/worker/fetch_mod_source.go;l=451
        const requiredFiles = ["./extension.yaml", "./functions/package.json"];
        // If the directory isn't found, no need to check for files or print errors.
        if (!fs.existsSync(args.path)) {
            return false;
        }
        for (const requiredFile of requiredFiles) {
            const f = path.join(args.path, requiredFile);
            if (!fs.existsSync(f)) {
                this.logger.logLabeled("BULLET", "extensions", `Detected invalid source code for ${args.extTarget}, expected to find ${f}`);
                return false;
            }
        }
        this.logger.logLabeled("DEBUG", "extensions", `Source code valid for ${args.extTarget}`);
        return true;
    }
    installAndBuildSourceCode(sourceCodePath) {
        // TODO: Add logging during this so it is clear what is happening.
        this.logger.logLabeled("DEBUG", "Extensions", `Running "npm install" for ${sourceCodePath}`);
        const functionsDirectory = path.resolve(sourceCodePath, "functions");
        const npmInstall = spawn.sync("npm", ["install"], {
            encoding: "utf8",
            cwd: functionsDirectory,
        });
        if (npmInstall.error) {
            throw npmInstall.error;
        }
        this.logger.logLabeled("DEBUG", "Extensions", `Finished "npm install" for ${sourceCodePath}`);
        this.logger.logLabeled("DEBUG", "Extensions", `Running "npm run gcp-build" for ${sourceCodePath}`);
        const npmRunGCPBuild = spawn.sync("npm", ["run", "gcp-build"], {
            encoding: "utf8",
            cwd: functionsDirectory,
        });
        if (npmRunGCPBuild.error) {
            // TODO: Make sure this does not error out if "gcp-build" is not defined, but does error if it fails otherwise.
            throw npmRunGCPBuild.error;
        }
        this.logger.logLabeled("DEBUG", "Extensions", `Finished "npm run gcp-build" for ${sourceCodePath}`);
    }
    /**
     *  getEmulatableBackends reads firebase.json & .env files for a list of extension instances to emulate,
     *  downloads & builds the necessary source code (if it hasn't previously been cached),
     *  then builds returns a list of emulatableBackends
     *  @return A list of emulatableBackends, one for each extension instance to be emulated
     */
    async getExtensionBackends() {
        this.backends = await this.getStaticExtensionBackends();
        for (const backends of Object.values(this.dynamicBackends)) {
            this.backends.push(...backends);
        }
        return this.backends;
    }
    async getStaticExtensionBackends() {
        await this.readManifest();
        await this.checkAndWarnAPIs(this.want);
        this.staticBackends = await Promise.all(this.want.map((i) => {
            return this.toEmulatableBackend(i);
        }));
        return this.staticBackends;
    }
    getDynamicExtensionBackends() {
        const dynamicBackends = [];
        for (const backends of Object.values(this.dynamicBackends)) {
            dynamicBackends.push(...backends);
        }
        return dynamicBackends;
    }
    async addDynamicExtensions(codebase, build) {
        const extensions = (0, common_1.extractExtensionsFromBuilds)({ build });
        this.wantDynamic[codebase] = await planner.wantDynamic({
            projectId: this.args.projectId,
            projectNumber: this.args.projectNumber,
            extensions,
            emulatorMode: true,
        });
        await this.checkAndWarnAPIs(this.wantDynamic[codebase]);
        this.dynamicBackends[codebase] = await Promise.all(this.wantDynamic[codebase].map((i) => {
            return this.toEmulatableBackend(i);
        }));
        // Make sure the new entries are in this.backends
        await this.getExtensionBackends();
    }
    /**
     * toEmulatableBackend turns a InstanceSpec into an EmulatableBackend which can be run by the Functions emulator.
     * It is exported for testing.
     */
    async toEmulatableBackend(instance) {
        const extensionDir = await this.ensureSourceCode(instance);
        // TODO: This should find package.json, then use that as functionsDir.
        const functionsDir = path.join(extensionDir, "functions");
        // TODO(b/213335255): For local extensions, this should include extensionSpec instead of extensionVersion
        const params = (0, paramHelper_1.populateDefaultParams)(instance.params, await planner.getExtensionSpec(instance));
        const env = Object.assign(this.autoPopulatedParams(instance), params);
        const { extensionTriggers, runtime, nonSecretEnv, secretEnvVariables } = await (0, optionsHelper_1.getExtensionFunctionInfo)(instance, env);
        const emulatableBackend = {
            functionsDir,
            runtime,
            bin: process.execPath,
            env: nonSecretEnv,
            codebase: instance.instanceId,
            secretEnv: secretEnvVariables,
            predefinedTriggers: extensionTriggers,
            extensionInstanceId: instance.instanceId,
        };
        if (instance.ref) {
            emulatableBackend.extension = await planner.getExtension(instance);
            emulatableBackend.extensionVersion = await planner.getExtensionVersion(instance);
        }
        else if (instance.localPath) {
            emulatableBackend.extensionSpec = await planner.getExtensionSpec(instance);
        }
        return emulatableBackend;
    }
    autoPopulatedParams(instance) {
        const projectId = this.args.projectId;
        return {
            PROJECT_ID: projectId ?? "",
            EXT_INSTANCE_ID: instance.instanceId,
            DATABASE_INSTANCE: projectId ?? "",
            DATABASE_URL: `https://${projectId}.firebaseio.com`,
            STORAGE_BUCKET: `${projectId}.appspot.com`,
            ALLOWED_EVENT_TYPES: instance.allowedEventTypes ? instance.allowedEventTypes.join(",") : "",
            EVENTARC_CHANNEL: instance.eventarcChannel ?? "",
            EVENTARC_CLOUD_EVENT_SOURCE: `projects/${projectId}/instances/${instance.instanceId}`,
        };
    }
    async checkAndWarnAPIs(instances) {
        const apisToWarn = await (0, validation_1.getUnemulatedAPIs)(this.args.projectId, instances);
        if (apisToWarn.length) {
            const table = new Table({
                head: [
                    "API Name",
                    "Instances using this API",
                    `Enabled on ${this.args.projectId}`,
                    `Enable this API`,
                ],
                style: { head: ["yellow"] },
            });
            for (const apiToWarn of apisToWarn) {
                // We use a shortened link here instead of a alias because cli-table behaves poorly with aliased links
                const enablementUri = await (0, shortenUrl_1.shortenUrl)((0, ensureApiEnabled_1.enableApiURI)(this.args.projectId, apiToWarn.apiName));
                table.push([
                    apiToWarn.apiName,
                    apiToWarn.instanceIds.join(", "),
                    apiToWarn.enabled ? "Yes" : "No",
                    apiToWarn.enabled ? "" : clc.bold(clc.underline(enablementUri)),
                ]);
            }
            if (constants_1.Constants.isDemoProject(this.args.projectId)) {
                this.logger.logLabeled("WARN", "Extensions", "The following Extensions make calls to Google Cloud APIs that do not have Emulators. " +
                    `${clc.bold(this.args.projectId)} is a demo project, so these Extensions may not work as expected.\n` +
                    table.toString());
            }
            else {
                this.logger.logLabeled("WARN", "Extensions", "The following Extensions make calls to Google Cloud APIs that do not have Emulators. " +
                    `These calls will go to production Google Cloud APIs which may have real effects on ${clc.bold(this.args.projectId)}.\n` +
                    table.toString());
            }
        }
    }
    /**
     * Filters out Extension backends that include any unemulated triggers.
     * @param backends a list of backends to filter
     * @return a list of backends that include only emulated triggers.
     */
    filterUnemulatedTriggers(backends) {
        let foundUnemulatedTrigger = false;
        const filteredBackends = backends.filter((backend) => {
            const unemulatedServices = (0, validation_1.checkForUnemulatedTriggerTypes)(backend, this.args.options);
            if (unemulatedServices.length) {
                foundUnemulatedTrigger = true;
                const msg = ` ignored becuase it includes ${unemulatedServices.join(", ")} triggered functions, and the ${unemulatedServices.join(", ")} emulator does not exist or is not running.`;
                this.logger.logLabeled("WARN", `extensions[${backend.extensionInstanceId}]`, msg);
            }
            return unemulatedServices.length === 0;
        });
        if (foundUnemulatedTrigger) {
            const msg = "No Cloud Functions for these instances will be emulated, because partially emulating an Extension can lead to unexpected behavior. ";
            // TODO(joehanley): "To partially emulate these Extension instance anyway, rerun this command with --force";
            this.logger.log("WARN", msg);
        }
        return filteredBackends;
    }
    extensionDetailsUILink(backend) {
        if (!registry_1.EmulatorRegistry.isRunning(types_1.Emulators.UI) || !backend.extensionInstanceId) {
            // If the Emulator UI is not running, or if this is not an Extension backend, return an empty string
            return "";
        }
        const uiUrl = registry_1.EmulatorRegistry.url(types_1.Emulators.UI);
        uiUrl.pathname = `/${types_1.Emulators.EXTENSIONS}/${backend.extensionInstanceId}`;
        return clc.underline(clc.bold(uiUrl.toString()));
    }
    extensionsInfoTable() {
        const filtedBackends = this.filterUnemulatedTriggers(this.backends);
        const uiRunning = registry_1.EmulatorRegistry.isRunning(types_1.Emulators.UI);
        const tableHead = ["Extension Instance Name", "Extension Ref"];
        if (uiRunning) {
            tableHead.push("View in Emulator UI");
        }
        const table = new Table({ head: tableHead, style: { head: ["yellow"] } });
        for (const b of filtedBackends) {
            if (b.extensionInstanceId) {
                const tableEntry = [b.extensionInstanceId, b.extensionVersion?.ref || "Local Extension"];
                if (uiRunning)
                    tableEntry.push(this.extensionDetailsUILink(b));
                table.push(tableEntry);
            }
        }
        return table.toString();
    }
}
exports.ExtensionsEmulator = ExtensionsEmulator;
//# sourceMappingURL=extensionsEmulator.js.map