"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.exportEmulatorData = exports.startAll = exports.shouldStart = exports.filterEmulatorTargets = exports.cleanShutdown = exports.onExit = exports.exportOnExit = void 0;
const clc = require("colorette");
const fs = require("fs");
const path = require("path");
const fsConfig = require("../firestore/fsConfig");
const proto = require("../gcp/proto");
const logger_1 = require("../logger");
const track_1 = require("../track");
const utils = require("../utils");
const registry_1 = require("./registry");
const types_1 = require("./types");
const constants_1 = require("./constants");
const functionsEmulator_1 = require("./functionsEmulator");
const error_1 = require("../error");
const projectUtils_1 = require("../projectUtils");
const commandUtils = require("./commandUtils");
const hub_1 = require("./hub");
const hubExport_1 = require("./hubExport");
const ui_1 = require("./ui");
const loggingEmulator_1 = require("./loggingEmulator");
const dbRulesConfig = require("../database/rulesConfig");
const emulatorLogger_1 = require("./emulatorLogger");
const hubClient_1 = require("./hubClient");
const prompt_1 = require("../prompt");
const commandUtils_1 = require("./commandUtils");
const fsutils_1 = require("../fsutils");
const config_1 = require("./storage/rules/config");
const getDefaultDatabaseInstance_1 = require("../getDefaultDatabaseInstance");
const auth_1 = require("../auth");
const extensionsEmulator_1 = require("./extensionsEmulator");
const projectConfig_1 = require("../functions/projectConfig");
const downloadableEmulators_1 = require("./downloadableEmulators");
const frameworks_1 = require("../frameworks");
const experiments = require("../experiments");
const portUtils_1 = require("./portUtils");
const supported_1 = require("../deploy/functions/runtimes/supported");
const auth_2 = require("./auth");
const databaseEmulator_1 = require("./databaseEmulator");
const eventarcEmulator_1 = require("./eventarcEmulator");
const dataconnectEmulator_1 = require("./dataconnectEmulator");
const firestoreEmulator_1 = require("./firestoreEmulator");
const hostingEmulator_1 = require("./hostingEmulator");
const pubsubEmulator_1 = require("./pubsubEmulator");
const storage_1 = require("./storage");
const load_1 = require("../dataconnect/load");
const tasksEmulator_1 = require("./tasksEmulator");
const apphosting_1 = require("./apphosting");
const webhook_1 = require("../dataconnect/webhook");
const api_1 = require("../api");
const projectPath_1 = require("../projectPath");
const START_LOGGING_EMULATOR = utils.envOverride("START_LOGGING_EMULATOR", "false", (val) => val === "true");
/**
 * Exports emulator data on clean exit (SIGINT or process end)
 * @param options
 */
async function exportOnExit(options) {
    // Note: options.exportOnExit is coerced to a string before this point in commandUtils.ts#setExportOnExitOptions
    const exportOnExitDir = options.exportOnExit;
    if (exportOnExitDir) {
        try {
            utils.logBullet(`Automatically exporting data using ${commandUtils_1.FLAG_EXPORT_ON_EXIT_NAME} "${exportOnExitDir}" ` +
                "please wait for the export to finish...");
            await exportEmulatorData(exportOnExitDir, options, /* initiatedBy= */ "exit");
        }
        catch (e) {
            utils.logWarning(`${e}`);
            utils.logWarning(`Automatic export to "${exportOnExitDir}" failed, going to exit now...`);
        }
    }
}
exports.exportOnExit = exportOnExit;
/**
 * Hook to do things when we're exiting cleanly (this does not include errors). Will be skipped on a second SIGINT
 * @param options
 */
async function onExit(options) {
    await exportOnExit(options);
}
exports.onExit = onExit;
/**
 * Hook to clean up on shutdown (includes errors). Will be skipped on a third SIGINT
 * Stops all running emulators in parallel.
 */
async function cleanShutdown() {
    emulatorLogger_1.EmulatorLogger.forEmulator(types_1.Emulators.HUB).logLabeled("BULLET", "emulators", "Shutting down emulators.");
    await registry_1.EmulatorRegistry.stopAll();
    await (0, webhook_1.sendVSCodeMessage)({ message: webhook_1.VSCODE_MESSAGE.EMULATORS_SHUTDOWN });
}
exports.cleanShutdown = cleanShutdown;
/**
 * Filters a list of emulators to only those specified in the config
 * @param options
 */
function filterEmulatorTargets(options) {
    let targets = [...types_1.ALL_SERVICE_EMULATORS];
    targets.push(types_1.Emulators.EXTENSIONS);
    targets = targets.filter((e) => {
        return options.config.has(e) || options.config.has(`emulators.${e}`);
    });
    // Extensions may not be initialized but we can have SDK defined extensions
    if (targets.includes(types_1.Emulators.FUNCTIONS) && !targets.includes(types_1.Emulators.EXTENSIONS)) {
        targets.push(types_1.Emulators.EXTENSIONS);
    }
    const onlyOptions = options.only;
    if (onlyOptions) {
        const only = onlyOptions.split(",").map((o) => {
            return o.split(":")[0];
        });
        targets = targets.filter((t) => only.includes(t));
    }
    return targets;
}
exports.filterEmulatorTargets = filterEmulatorTargets;
/**
 * Returns whether or not a specific emulator should start based on configuration and dependencies.
 * @param options
 * @param name
 */
function shouldStart(options, name) {
    var _a, _b;
    if (name === types_1.Emulators.HUB) {
        // The emulator hub always starts.
        return true;
    }
    const targets = filterEmulatorTargets(options);
    const emulatorInTargets = targets.includes(name);
    if (name === types_1.Emulators.UI) {
        if (options.ui) {
            return true;
        }
        if (((_b = (_a = options.config.src.emulators) === null || _a === void 0 ? void 0 : _a.ui) === null || _b === void 0 ? void 0 : _b.enabled) === false) {
            // Allow disabling UI via `{emulators: {"ui": {"enabled": false}}}`.
            // Emulator UI is by default enabled if that option is not specified.
            return false;
        }
        // Emulator UI only starts if we know the project ID AND at least one
        // emulator supported by Emulator UI is launching.
        return targets.some((target) => types_1.EMULATORS_SUPPORTED_BY_UI.includes(target));
    }
    // Don't start the functions emulator if we can't validate the functions config
    if (name === types_1.Emulators.FUNCTIONS && emulatorInTargets) {
        try {
            (0, projectConfig_1.normalizeAndValidate)(options.config.src.functions);
            return true;
        }
        catch (err) {
            emulatorLogger_1.EmulatorLogger.forEmulator(types_1.Emulators.FUNCTIONS).logLabeled("ERROR", "functions", `Failed to start Functions emulator: ${err.message}`);
            return false;
        }
    }
    if (name === types_1.Emulators.HOSTING && emulatorInTargets && !options.config.get("hosting")) {
        emulatorLogger_1.EmulatorLogger.forEmulator(types_1.Emulators.HOSTING).logLabeled("WARN", "hosting", `The hosting emulator is configured but there is no hosting configuration. Have you run ${clc.bold("firebase init hosting")}?`);
        return false;
    }
    return emulatorInTargets;
}
exports.shouldStart = shouldStart;
function findExportMetadata(importPath) {
    const pathExists = fs.existsSync(importPath);
    if (!pathExists) {
        throw new error_1.FirebaseError(`Directory "${importPath}" does not exist.`);
    }
    const pathIsDirectory = fs.lstatSync(importPath).isDirectory();
    if (!pathIsDirectory) {
        return;
    }
    // If there is an export metadata file, we always prefer that
    const importFilePath = path.join(importPath, hubExport_1.HubExport.METADATA_FILE_NAME);
    if ((0, fsutils_1.fileExistsSync)(importFilePath)) {
        return JSON.parse(fs.readFileSync(importFilePath, "utf8").toString());
    }
    const fileList = fs.readdirSync(importPath);
    // The user might have passed a Firestore export directly
    const firestoreMetadataFile = fileList.find((f) => f.endsWith(".overall_export_metadata"));
    if (firestoreMetadataFile) {
        const metadata = {
            version: hub_1.EmulatorHub.CLI_VERSION,
            firestore: {
                version: "prod",
                path: importPath,
                metadata_file: `${importPath}/${firestoreMetadataFile}`,
            },
        };
        emulatorLogger_1.EmulatorLogger.forEmulator(types_1.Emulators.FIRESTORE).logLabeled("BULLET", "firestore", `Detected non-emulator Firestore export at ${importPath}`);
        return metadata;
    }
    // The user might haved passed a directory containing RTDB json files
    const rtdbDataFile = fileList.find((f) => f.endsWith(".json"));
    if (rtdbDataFile) {
        const metadata = {
            version: hub_1.EmulatorHub.CLI_VERSION,
            database: {
                version: "prod",
                path: importPath,
            },
        };
        emulatorLogger_1.EmulatorLogger.forEmulator(types_1.Emulators.DATABASE).logLabeled("BULLET", "firestore", `Detected non-emulator Database export at ${importPath}`);
        return metadata;
    }
}
/**
 * Start all emulators.
 */
async function startAll(options, showUI = true, runningTestScript = false) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l;
    // Emulators config is specified in firebase.json as:
    // "emulators": {
    //   "firestore": {
    //     "host": "localhost",
    //     "port": "9005"
    //   },
    //   // ...
    // }
    //
    // The list of emulators to start is filtered two ways:
    // 1) The service must have a top-level entry in firebase.json or an entry in the emulators{} object
    // 2) If the --only flag is passed, then this list is the intersection
    const targets = filterEmulatorTargets(options);
    options.targets = targets;
    const singleProjectModeEnabled = ((_a = options.config.src.emulators) === null || _a === void 0 ? void 0 : _a.singleProjectMode) === undefined ||
        ((_b = options.config.src.emulators) === null || _b === void 0 ? void 0 : _b.singleProjectMode);
    if (targets.length === 0) {
        throw new error_1.FirebaseError(`No emulators to start, run ${clc.bold("firebase init emulators")} to get started.`);
    }
    if (targets.some(downloadableEmulators_1.requiresJava)) {
        if ((await commandUtils.checkJavaMajorVersion()) < commandUtils_1.MIN_SUPPORTED_JAVA_MAJOR_VERSION) {
            utils.logLabeledError("emulators", commandUtils_1.JAVA_DEPRECATION_WARNING, "warn");
            throw new error_1.FirebaseError(commandUtils_1.JAVA_DEPRECATION_WARNING);
        }
    }
    if (options.logVerbosity) {
        emulatorLogger_1.EmulatorLogger.setVerbosity(emulatorLogger_1.Verbosity[options.logVerbosity]);
    }
    const hubLogger = emulatorLogger_1.EmulatorLogger.forEmulator(types_1.Emulators.HUB);
    hubLogger.logLabeled("BULLET", "emulators", `Starting emulators: ${targets.join(", ")}`);
    const projectId = (0, projectUtils_1.getProjectId)(options) || hub_1.EmulatorHub.MISSING_PROJECT_PLACEHOLDER;
    const isDemoProject = constants_1.Constants.isDemoProject(projectId);
    if (isDemoProject) {
        hubLogger.logLabeled("BULLET", "emulators", `Detected demo project ID "${projectId}", emulated services will use a demo configuration and attempts to access non-emulated services for this project will fail.`);
    }
    const onlyOptions = options.only;
    if (onlyOptions) {
        const requested = onlyOptions.split(",").map((o) => {
            return o.split(":")[0];
        });
        const ignored = requested.filter((k) => !targets.includes(k));
        for (const name of ignored) {
            if ((0, types_1.isEmulator)(name)) {
                emulatorLogger_1.EmulatorLogger.forEmulator(name).logLabeled("WARN", name, `Not starting the ${clc.bold(name)} emulator, make sure you have run ${clc.bold("firebase init")}.`);
            }
            else {
                // this should not work:
                // firebase emulators:start --only doesnotexist
                throw new error_1.FirebaseError(`${name} is not a valid emulator name, valid options are: ${JSON.stringify(types_1.ALL_SERVICE_EMULATORS)}`, { exit: 1 });
            }
        }
    }
    const emulatableBackends = [];
    // Process extensions config early so that we have a better guess at whether
    // the Functions emulator needs to start.
    let extensionEmulator = undefined;
    if (shouldStart(options, types_1.Emulators.EXTENSIONS)) {
        let projectNumber = constants_1.Constants.FAKE_PROJECT_NUMBER;
        if (!isDemoProject) {
            try {
                projectNumber = await (0, projectUtils_1.needProjectNumber)(options);
            }
            catch (err) {
                emulatorLogger_1.EmulatorLogger.forEmulator(types_1.Emulators.EXTENSIONS).logLabeled("ERROR", types_1.Emulators.EXTENSIONS, `Unable to look up project number for ${options.project}.\n` +
                    " If this is a real project, ensure that you are logged in and have access to it.\n" +
                    " If this is a fake project, please use a project ID starting with 'demo-' to skip production calls.\n" +
                    " Continuing with a fake project number - secrets and other features that require production access may behave unexpectedly.");
            }
        }
        const aliases = (0, projectUtils_1.getAliases)(options, projectId);
        extensionEmulator = new extensionsEmulator_1.ExtensionsEmulator({
            options,
            projectId,
            projectDir: options.config.projectDir,
            projectNumber,
            aliases,
            extensions: options.config.get("extensions"),
        });
        const extensionsBackends = await extensionEmulator.getExtensionBackends();
        const filteredExtensionsBackends = extensionEmulator.filterUnemulatedTriggers(extensionsBackends);
        emulatableBackends.push(...filteredExtensionsBackends);
        (0, track_1.trackGA4)("extensions_emulated", {
            number_of_extensions_emulated: filteredExtensionsBackends.length,
            number_of_extensions_ignored: extensionsBackends.length - filteredExtensionsBackends.length,
        });
    }
    const listenConfig = {};
    if (emulatableBackends.length) {
        // If we already know we need Functions (and Eventarc), assign them now.
        listenConfig[types_1.Emulators.FUNCTIONS] = getListenConfig(options, types_1.Emulators.FUNCTIONS);
        listenConfig[types_1.Emulators.EVENTARC] = getListenConfig(options, types_1.Emulators.EVENTARC);
        listenConfig[types_1.Emulators.TASKS] = getListenConfig(options, types_1.Emulators.TASKS);
    }
    for (const emulator of types_1.ALL_EMULATORS) {
        if (emulator === types_1.Emulators.FUNCTIONS ||
            emulator === types_1.Emulators.EVENTARC ||
            emulator === types_1.Emulators.TASKS ||
            // Same port as Functions, no need for separate assignment
            emulator === types_1.Emulators.EXTENSIONS ||
            (emulator === types_1.Emulators.UI && !showUI)) {
            continue;
        }
        if (shouldStart(options, emulator) ||
            (emulator === types_1.Emulators.LOGGING &&
                ((showUI && shouldStart(options, types_1.Emulators.UI)) || START_LOGGING_EMULATOR))) {
            const config = getListenConfig(options, emulator);
            listenConfig[emulator] = config;
            if (emulator === types_1.Emulators.FIRESTORE) {
                const wsPortConfig = (_d = (_c = options.config.src.emulators) === null || _c === void 0 ? void 0 : _c.firestore) === null || _d === void 0 ? void 0 : _d.websocketPort;
                listenConfig["firestore.websocket"] = {
                    host: config.host,
                    port: wsPortConfig || 9150,
                    portFixed: !!wsPortConfig,
                };
            }
            if (emulator === types_1.Emulators.DATACONNECT && !(0, api_1.dataConnectLocalConnString)()) {
                const pglitePortConfig = (_f = (_e = options.config.src.emulators) === null || _e === void 0 ? void 0 : _e.dataconnect) === null || _f === void 0 ? void 0 : _f.postgresPort;
                listenConfig["dataconnect.postgres"] = {
                    host: config.host,
                    port: pglitePortConfig || 5432,
                    portFixed: !!pglitePortConfig,
                };
            }
        }
    }
    let listenForEmulator = await (0, portUtils_1.resolveHostAndAssignPorts)(listenConfig);
    hubLogger.log("DEBUG", "assigned listening specs for emulators", { user: listenForEmulator });
    function legacyGetFirstAddr(name) {
        const firstSpec = listenForEmulator[name][0];
        return {
            host: firstSpec.address,
            port: firstSpec.port,
        };
    }
    function startEmulator(instance) {
        const name = instance.getName();
        // Log the command for analytics
        void (0, track_1.trackEmulator)("emulator_run", {
            emulator_name: name,
            is_demo_project: String(isDemoProject),
        });
        return registry_1.EmulatorRegistry.start(instance);
    }
    if (listenForEmulator.hub) {
        const hub = new hub_1.EmulatorHub({
            projectId,
            listen: listenForEmulator[types_1.Emulators.HUB],
            listenForEmulator,
        });
        // Log the command for analytics, we only report this for "hub"
        // since we originally mistakenly reported emulators:start events
        // for each emulator, by reporting the "hub" we ensure that our
        // historical data can still be viewed.
        await startEmulator(hub);
    }
    // Parse export metadata
    let exportMetadata = {
        version: "unknown",
    };
    if (options.import) {
        utils.assertIsString(options.import);
        const importDir = path.resolve(options.import);
        const foundMetadata = findExportMetadata(importDir);
        if (foundMetadata) {
            exportMetadata = foundMetadata;
            void (0, track_1.trackEmulator)("emulator_import", {
                initiated_by: "start",
                emulator_name: types_1.Emulators.HUB,
            });
        }
        else {
            hubLogger.logLabeled("WARN", "emulators", `Could not find import/export metadata file, ${clc.bold("skipping data import!")}`);
        }
    }
    // TODO: turn this into hostingConfig.extract or hostingConfig.hostingConfig
    // once those branches merge
    const hostingConfig = options.config.get("hosting");
    if (Array.isArray(hostingConfig) ? hostingConfig.some((it) => it.source) : hostingConfig === null || hostingConfig === void 0 ? void 0 : hostingConfig.source) {
        experiments.assertEnabled("webframeworks", "emulate a web framework");
        const emulators = [];
        for (const e of types_1.ALL_SERVICE_EMULATORS) {
            // TODO(yuchenshi): Functions and Eventarc may be missing if they are not
            // yet known to be needed and then prepareFrameworks adds extra functions.
            if (listenForEmulator[e]) {
                emulators.push({
                    name: e,
                    host: utils.connectableHostname(listenForEmulator[e][0].address),
                    port: listenForEmulator[e][0].port,
                });
            }
        }
        // This may add additional sources for Functions emulator and must be done before it.
        await (0, frameworks_1.prepareFrameworks)(runningTestScript ? "test" : "emulate", targets, undefined, options, emulators);
    }
    const projectDir = (options.extDevDir || options.config.projectDir);
    if (shouldStart(options, types_1.Emulators.FUNCTIONS)) {
        const functionsCfg = (0, projectConfig_1.normalizeAndValidate)(options.config.src.functions);
        // Note: ext:dev:emulators:* commands hit this path, not the Emulators.EXTENSIONS path
        utils.assertIsStringOrUndefined(options.extDevDir);
        for (const cfg of functionsCfg) {
            const localCfg = (0, projectConfig_1.requireLocal)(cfg, "Remote sources are not supported in the Functions emulator.");
            const functionsDir = path.join(projectDir, localCfg.source);
            const runtime = ((_g = options.extDevRuntime) !== null && _g !== void 0 ? _g : cfg.runtime);
            // N.B. (Issue #6965) it's OK for runtime to be undefined because the functions discovery process
            // will dynamically detect it later.
            // TODO: does runtime even need to be a part of EmultableBackend now that we have dynamic runtime
            // detection? Might be an extensions thing.
            if (runtime && !(0, supported_1.isRuntime)(runtime)) {
                throw new error_1.FirebaseError(`Cannot load functions from ${functionsDir} because it has invalid runtime ${runtime}`);
            }
            const backend = {
                functionsDir,
                runtime,
                codebase: localCfg.codebase,
                prefix: localCfg.prefix,
                env: Object.assign({}, options.extDevEnv),
                secretEnv: [],
                // TODO(b/213335255): predefinedTriggers and nodeMajorVersion are here to support ext:dev:emulators:* commands.
                // Ideally, we should handle that case via ExtensionEmulator.
                predefinedTriggers: options.extDevTriggers,
                ignore: localCfg.ignore,
            };
            proto.convertIfPresent(backend, localCfg, "configDir", (cd) => path.join(projectDir, cd));
            emulatableBackends.push(backend);
        }
    }
    if (extensionEmulator) {
        await startEmulator(extensionEmulator);
    }
    const account = (0, auth_1.getProjectDefaultAccount)(options.projectRoot);
    if (emulatableBackends.length) {
        if (!listenForEmulator.functions || !listenForEmulator.eventarc || !listenForEmulator.tasks) {
            // We did not know that we need Functions and Eventarc earlier but now we do.
            listenForEmulator = await (0, portUtils_1.resolveHostAndAssignPorts)(Object.assign(Object.assign({}, listenForEmulator), { functions: (_h = listenForEmulator.functions) !== null && _h !== void 0 ? _h : getListenConfig(options, types_1.Emulators.FUNCTIONS), eventarc: (_j = listenForEmulator.eventarc) !== null && _j !== void 0 ? _j : getListenConfig(options, types_1.Emulators.EVENTARC), tasks: (_k = listenForEmulator.eventarc) !== null && _k !== void 0 ? _k : getListenConfig(options, types_1.Emulators.TASKS) }));
            hubLogger.log("DEBUG", "late-assigned ports for functions and eventarc emulators", {
                user: listenForEmulator,
            });
        }
        const functionsLogger = emulatorLogger_1.EmulatorLogger.forEmulator(types_1.Emulators.FUNCTIONS);
        const functionsAddr = legacyGetFirstAddr(types_1.Emulators.FUNCTIONS);
        const inspectFunctions = commandUtils.parseInspectionPort(options);
        if (inspectFunctions) {
            // TODO(samstern): Add a link to documentation
            functionsLogger.logLabeled("WARN", "functions", `You are running the Functions emulator in debug mode. This means that functions will execute in sequence rather than in parallel.`);
        }
        // Warn the developer that the Functions/Extensions emulator can call out to production.
        const emulatorsNotRunning = types_1.ALL_SERVICE_EMULATORS.filter((e) => {
            return e !== types_1.Emulators.FUNCTIONS && !listenForEmulator[e];
        });
        if (emulatorsNotRunning.length > 0 && !constants_1.Constants.isDemoProject(projectId)) {
            functionsLogger.logLabeled("WARN", "functions", `The following emulators are not running, calls to these services from the Functions emulator will affect production: ${clc.bold(emulatorsNotRunning.join(", "))}`);
        }
        // TODO(b/213241033): Figure out how to watch for changes to extensions .env files & reload triggers when they change.
        const functionsEmulator = new functionsEmulator_1.FunctionsEmulator({
            projectId,
            projectDir,
            emulatableBackends,
            account,
            host: functionsAddr.host,
            port: functionsAddr.port,
            debugPort: inspectFunctions,
            verbosity: options.logVerbosity,
            projectAlias: options.projectAlias,
            extensionsEmulator: extensionEmulator,
        });
        await startEmulator(functionsEmulator);
        const eventarcAddr = legacyGetFirstAddr(types_1.Emulators.EVENTARC);
        const eventarcEmulator = new eventarcEmulator_1.EventarcEmulator({
            host: eventarcAddr.host,
            port: eventarcAddr.port,
        });
        await startEmulator(eventarcEmulator);
        const tasksAddr = legacyGetFirstAddr(types_1.Emulators.TASKS);
        const tasksEmulator = new tasksEmulator_1.TasksEmulator({
            host: tasksAddr.host,
            port: tasksAddr.port,
        });
        await startEmulator(tasksEmulator);
    }
    if (listenForEmulator.firestore) {
        const firestoreLogger = emulatorLogger_1.EmulatorLogger.forEmulator(types_1.Emulators.FIRESTORE);
        const firestoreAddr = legacyGetFirstAddr(types_1.Emulators.FIRESTORE);
        const websocketPort = legacyGetFirstAddr("firestore.websocket").port;
        const args = {
            host: firestoreAddr.host,
            port: firestoreAddr.port,
            websocket_port: websocketPort,
            project_id: projectId,
            auto_download: true,
        };
        if (exportMetadata.firestore) {
            utils.assertIsString(options.import);
            const importDirAbsPath = path.resolve(options.import);
            const exportMetadataFilePath = path.resolve(importDirAbsPath, exportMetadata.firestore.metadata_file);
            firestoreLogger.logLabeled("BULLET", "firestore", `Importing data from ${exportMetadataFilePath}`);
            args.seed_from_export = exportMetadataFilePath;
            void (0, track_1.trackEmulator)("emulator_import", {
                initiated_by: "start",
                emulator_name: types_1.Emulators.FIRESTORE,
            });
        }
        const config = options.config;
        // emulator does not support multiple databases yet
        // TODO(VicVer09): b/269787702
        let rulesLocalPath;
        let rulesFileFound;
        const firestoreConfigs = fsConfig.getFirestoreConfig(projectId, options);
        if (!firestoreConfigs) {
            firestoreLogger.logLabeled("WARN", "firestore", `Cloud Firestore config does not exist in firebase.json.`);
        }
        else if (firestoreConfigs.length !== 1) {
            firestoreLogger.logLabeled("WARN", "firestore", `Cloud Firestore Emulator does not support multiple databases yet.`);
        }
        else if (firestoreConfigs[0].rules) {
            rulesLocalPath = firestoreConfigs[0].rules;
        }
        if (rulesLocalPath) {
            const rules = config.path(rulesLocalPath);
            rulesFileFound = fs.existsSync(rules);
            if (rulesFileFound) {
                args.rules = rules;
            }
            else {
                firestoreLogger.logLabeled("WARN", "firestore", `Cloud Firestore rules file ${clc.bold(rules)} specified in firebase.json does not exist.`);
            }
        }
        else {
            firestoreLogger.logLabeled("WARN", "firestore", "Did not find a Cloud Firestore rules file specified in a firebase.json config file.");
        }
        if (!rulesFileFound) {
            firestoreLogger.logLabeled("WARN", "firestore", "The emulator will default to allowing all reads and writes. Learn more about this option: https://firebase.google.com/docs/emulator-suite/install_and_configure#security_rules_configuration.");
        }
        // undefined in the config defaults to setting single_project_mode.
        if (singleProjectModeEnabled) {
            args.single_project_mode = true;
            args.single_project_mode_error = false;
        }
        const firestoreEmulator = new firestoreEmulator_1.FirestoreEmulator(args);
        await startEmulator(firestoreEmulator);
        firestoreLogger.logLabeled("SUCCESS", types_1.Emulators.FIRESTORE, `Firestore Emulator UI websocket is running on ${websocketPort}.`);
    }
    if (listenForEmulator.database) {
        const databaseLogger = emulatorLogger_1.EmulatorLogger.forEmulator(types_1.Emulators.DATABASE);
        const databaseAddr = legacyGetFirstAddr(types_1.Emulators.DATABASE);
        const args = {
            host: databaseAddr.host,
            port: databaseAddr.port,
            projectId,
            auto_download: true,
            // Only set the flag (at all) if singleProjectMode is enabled.
            single_project_mode: singleProjectModeEnabled ? "Warning" : undefined,
        };
        // Try to fetch the default RTDB instance for a project, but don't hard-fail if we
        // can't because the user may be using a fake project.
        try {
            if (!options.instance) {
                options.instance = await (0, getDefaultDatabaseInstance_1.getDefaultDatabaseInstance)(options);
            }
        }
        catch (e) {
            databaseLogger.log("DEBUG", `Failed to retrieve default database instance: ${JSON.stringify(e)}`);
        }
        const rc = dbRulesConfig.normalizeRulesConfig(dbRulesConfig.getRulesConfig(projectId, options), options);
        logger_1.logger.debug("database rules config: ", JSON.stringify(rc));
        args.rules = rc;
        if (rc.length === 0) {
            databaseLogger.logLabeled("WARN", "database", "Did not find a Realtime Database rules file specified in a firebase.json config file. The emulator will default to allowing all reads and writes. Learn more about this option: https://firebase.google.com/docs/emulator-suite/install_and_configure#security_rules_configuration.");
        }
        else {
            for (const c of rc) {
                const rules = c.rules;
                if (!fs.existsSync(rules)) {
                    databaseLogger.logLabeled("WARN", "database", `Realtime Database rules file ${clc.bold(rules)} specified in firebase.json does not exist.`);
                }
            }
        }
        const databaseEmulator = new databaseEmulator_1.DatabaseEmulator(args);
        await startEmulator(databaseEmulator);
        if (exportMetadata.database) {
            utils.assertIsString(options.import);
            const importDirAbsPath = path.resolve(options.import);
            const databaseExportDir = path.resolve(importDirAbsPath, exportMetadata.database.path);
            const files = fs.readdirSync(databaseExportDir).filter((f) => f.endsWith(".json"));
            void (0, track_1.trackEmulator)("emulator_import", {
                initiated_by: "start",
                emulator_name: types_1.Emulators.DATABASE,
                count: files.length,
            });
            for (const f of files) {
                const fPath = path.join(databaseExportDir, f);
                const ns = path.basename(f, ".json");
                await databaseEmulator.importData(ns, fPath);
            }
        }
    }
    if (listenForEmulator.auth) {
        const authAddr = legacyGetFirstAddr(types_1.Emulators.AUTH);
        const authEmulator = new auth_2.AuthEmulator({
            host: authAddr.host,
            port: authAddr.port,
            projectId,
            singleProjectMode: singleProjectModeEnabled
                ? auth_2.SingleProjectMode.WARNING
                : auth_2.SingleProjectMode.NO_WARNING,
        });
        await startEmulator(authEmulator);
        if (exportMetadata.auth) {
            utils.assertIsString(options.import);
            const importDirAbsPath = path.resolve(options.import);
            const authExportDir = path.resolve(importDirAbsPath, exportMetadata.auth.path);
            await authEmulator.importData(authExportDir, projectId, { initiatedBy: "start" });
        }
    }
    if (listenForEmulator.pubsub) {
        const pubsubAddr = legacyGetFirstAddr(types_1.Emulators.PUBSUB);
        const pubsubEmulator = new pubsubEmulator_1.PubsubEmulator({
            host: pubsubAddr.host,
            port: pubsubAddr.port,
            projectId,
            auto_download: true,
        });
        await startEmulator(pubsubEmulator);
    }
    if (listenForEmulator.dataconnect) {
        const config = (0, load_1.readFirebaseJson)(options.config);
        if (!config.length) {
            throw new error_1.FirebaseError("No Data Connect service found in firebase.json");
        }
        else if (config.length > 1) {
            logger_1.logger.warn(`TODO: Add support for multiple services in the Data Connect emulator. Currently emulating first service ${config[0].source}`);
        }
        const args = {
            listen: listenForEmulator.dataconnect,
            projectId,
            auto_download: true,
            configDir: config[0].source,
            config: options.config,
            autoconnectToPostgres: true,
            postgresListen: listenForEmulator["dataconnect.postgres"],
            enable_output_generated_sdk: true,
            enable_output_schema_extensions: true,
            debug: options.debug,
            account,
        };
        if (exportMetadata.dataconnect) {
            utils.assertIsString(options.import);
            const importDirAbsPath = path.resolve(options.import);
            const exportMetadataFilePath = path.resolve(importDirAbsPath, exportMetadata.dataconnect.path);
            const dataDirectory = options.config.get("emulators.dataconnect.dataDir");
            if (exportMetadataFilePath && dataDirectory) {
                emulatorLogger_1.EmulatorLogger.forEmulator(types_1.Emulators.DATACONNECT).logLabeled("WARN", "dataconnect", "'firebase.json#emulators.dataconnect.dataDir' is set and `--import` flag was passed. " +
                    "This will overwrite any data saved from previous runs.");
                if (!options.nonInteractive &&
                    !(await (0, prompt_1.confirm)({
                        message: `Do you wish to continue and overwrite data in ${dataDirectory}?`,
                        default: false,
                    }))) {
                    await cleanShutdown();
                    throw new error_1.FirebaseError("Command aborted");
                }
            }
            emulatorLogger_1.EmulatorLogger.forEmulator(types_1.Emulators.DATACONNECT).logLabeled("BULLET", "dataconnect", `Importing data from ${exportMetadataFilePath}`);
            args.importPath = exportMetadataFilePath;
            void (0, track_1.trackEmulator)("emulator_import", {
                initiated_by: "start",
                emulator_name: types_1.Emulators.DATACONNECT,
            });
        }
        const dataConnectEmulator = new dataconnectEmulator_1.DataConnectEmulator(args);
        await startEmulator(dataConnectEmulator);
    }
    if (listenForEmulator.storage) {
        const storageAddr = legacyGetFirstAddr(types_1.Emulators.STORAGE);
        const storageEmulator = new storage_1.StorageEmulator({
            host: storageAddr.host,
            port: storageAddr.port,
            projectId,
            rules: (0, config_1.getStorageRulesConfig)(projectId, options),
        });
        await startEmulator(storageEmulator);
        if (exportMetadata.storage) {
            utils.assertIsString(options.import);
            const importDirAbsPath = path.resolve(options.import);
            const storageExportDir = path.resolve(importDirAbsPath, exportMetadata.storage.path);
            storageEmulator.storageLayer.import(storageExportDir, { initiatedBy: "start" });
        }
    }
    // Hosting emulator needs to start after all of the others so that we can detect
    // which are running and call useEmulator in __init.js
    if (listenForEmulator.hosting) {
        const hostingAddr = legacyGetFirstAddr(types_1.Emulators.HOSTING);
        const hostingEmulator = new hostingEmulator_1.HostingEmulator({
            host: hostingAddr.host,
            port: hostingAddr.port,
            options,
        });
        await startEmulator(hostingEmulator);
    }
    /**
     * Similar to the Hosting emulator, the App Hosting emulator should also
     * start after the other emulators. This is because the service running on
     * app hosting emulator may depend on other emulators (i.e auth, firestore,
     * storage, etc).
     */
    const apphostingEmulatorConfig = (_l = options.config.src.emulators) === null || _l === void 0 ? void 0 : _l[types_1.Emulators.APPHOSTING];
    if (listenForEmulator.apphosting) {
        const rootDirectory = apphostingEmulatorConfig === null || apphostingEmulatorConfig === void 0 ? void 0 : apphostingEmulatorConfig.rootDirectory;
        const backendRoot = (0, projectPath_1.resolveProjectPath)({}, rootDirectory !== null && rootDirectory !== void 0 ? rootDirectory : "./");
        // It doesn't seem as though App Hosting emulator supports multiple backends, infer the correct one
        // from the root directory.
        let apphostingConfig;
        if (Array.isArray(options.config.src.apphosting)) {
            const matchingAppHostingConfig = options.config.src.apphosting.filter((config) => { var _a; return (0, projectPath_1.resolveProjectPath)({}, path.join(".", (_a = config.rootDir) !== null && _a !== void 0 ? _a : "/")) === backendRoot; });
            if (matchingAppHostingConfig.length === 1) {
                apphostingConfig = matchingAppHostingConfig[0];
            }
        }
        else {
            apphostingConfig = options.config.src.apphosting;
        }
        const apphostingAddr = legacyGetFirstAddr(types_1.Emulators.APPHOSTING);
        if (apphostingEmulatorConfig === null || apphostingEmulatorConfig === void 0 ? void 0 : apphostingEmulatorConfig.startCommandOverride) {
            const apphostingLogger = emulatorLogger_1.EmulatorLogger.forEmulator(types_1.Emulators.APPHOSTING);
            apphostingLogger.logLabeled("WARN", types_1.Emulators.APPHOSTING, "The `firebase.json#emulators.apphosting.startCommandOverride` config is deprecated, please use `firebase.json#emulators.apphosting.startCommand` to set a custom start command instead");
        }
        const apphostingEmulator = new apphosting_1.AppHostingEmulator({
            projectId: options.project,
            backendId: apphostingConfig === null || apphostingConfig === void 0 ? void 0 : apphostingConfig.backendId,
            host: apphostingAddr.host,
            port: apphostingAddr.port,
            startCommand: (apphostingEmulatorConfig === null || apphostingEmulatorConfig === void 0 ? void 0 : apphostingEmulatorConfig.startCommand) || (apphostingEmulatorConfig === null || apphostingEmulatorConfig === void 0 ? void 0 : apphostingEmulatorConfig.startCommandOverride),
            rootDirectory,
            options,
        });
        await startEmulator(apphostingEmulator);
    }
    if (listenForEmulator.logging) {
        const loggingAddr = legacyGetFirstAddr(types_1.Emulators.LOGGING);
        const loggingEmulator = new loggingEmulator_1.LoggingEmulator({
            host: loggingAddr.host,
            port: loggingAddr.port,
        });
        await startEmulator(loggingEmulator);
    }
    if (showUI && !shouldStart(options, types_1.Emulators.UI)) {
        hubLogger.logLabeled("WARN", "emulators", "The Emulator UI is not starting because none of the running " +
            "emulators have a UI component.");
    }
    if (listenForEmulator.ui) {
        const ui = new ui_1.EmulatorUI({
            projectId,
            listen: listenForEmulator[types_1.Emulators.UI],
        });
        await startEmulator(ui);
    }
    let serviceEmulatorCount = 0;
    const running = registry_1.EmulatorRegistry.listRunning();
    for (const name of running) {
        const instance = registry_1.EmulatorRegistry.get(name);
        if (instance) {
            await instance.connect();
        }
        if (types_1.ALL_SERVICE_EMULATORS.includes(name)) {
            serviceEmulatorCount++;
        }
    }
    void (0, track_1.trackEmulator)("emulators_started", {
        count: serviceEmulatorCount,
        count_all: running.length,
        is_demo_project: String(isDemoProject),
    });
    return { deprecationNotices: [] };
}
exports.startAll = startAll;
function getListenConfig(options, emulator) {
    var _a, _b, _c, _d;
    let host = ((_b = (_a = options.config.src.emulators) === null || _a === void 0 ? void 0 : _a[emulator]) === null || _b === void 0 ? void 0 : _b.host) || constants_1.Constants.getDefaultHost();
    if (host === "localhost" && utils.isRunningInWSL()) {
        // HACK(https://github.com/firebase/firebase-tools-ui/issues/332): Use IPv4
        // 127.0.0.1 instead of localhost. This, combined with the hack in
        // downloadableEmulators.ts, forces the emulator to listen on IPv4 ONLY.
        // The CLI (including the hub) will also consistently report 127.0.0.1,
        // causing clients to connect via IPv4 only (which mitigates the problem of
        // some clients resolving localhost to IPv6 and get connection refused).
        host = "127.0.0.1";
    }
    const portVal = (_d = (_c = options.config.src.emulators) === null || _c === void 0 ? void 0 : _c[emulator]) === null || _d === void 0 ? void 0 : _d.port;
    let port;
    let portFixed;
    if (portVal) {
        port = parseInt(`${portVal}`, 10);
        portFixed = true;
    }
    else {
        port = constants_1.Constants.getDefaultPort(emulator);
        portFixed = !constants_1.FIND_AVAILBLE_PORT_BY_DEFAULT[emulator];
    }
    return {
        host,
        port,
        portFixed,
    };
}
/**
 * Exports data from emulators that support data export. Used with `emulators:export` and with the --export-on-exit flag.
 * @param exportPath
 * @param options
 */
async function exportEmulatorData(exportPath, options, initiatedBy) {
    const projectId = options.project;
    const hubClient = new hubClient_1.EmulatorHubClient(projectId);
    if (!hubClient.foundHub()) {
        throw new error_1.FirebaseError(`Did not find any running emulators for project ${clc.bold(projectId)}.`, { exit: 1 });
    }
    let origin;
    try {
        origin = await hubClient.getStatus();
    }
    catch (e) {
        const filePath = hub_1.EmulatorHub.getLocatorFilePath(projectId);
        throw new error_1.FirebaseError(`The emulator hub for ${projectId} did not respond to a status check. If this error continues try shutting down all running emulators and deleting the file ${filePath}`, { exit: 1 });
    }
    utils.logBullet(`Found running emulator hub for project ${clc.bold(projectId)} at ${origin}`);
    // If the export target directory does not exist, we should attempt to create it
    const exportAbsPath = path.resolve(exportPath);
    if (!fs.existsSync(exportAbsPath)) {
        utils.logBullet(`Creating export directory ${exportAbsPath}`);
        fs.mkdirSync(exportAbsPath, { recursive: true });
    }
    // Check if there is already an export there and prompt the user about deleting it
    const existingMetadata = hubExport_1.HubExport.readMetadata(exportAbsPath);
    const isExportDirEmpty = fs.readdirSync(exportAbsPath).length === 0;
    if ((existingMetadata || !isExportDirEmpty) && !(options.force || options.exportOnExit)) {
        if (options.noninteractive) {
            throw new error_1.FirebaseError("Export already exists in the target directory, re-run with --force to overwrite.", { exit: 1 });
        }
        const prompt = await (0, prompt_1.confirm)({
            message: `The directory ${exportAbsPath} is not empty. Existing files in this directory will be overwritten. Do you want to continue?`,
            nonInteractive: options.nonInteractive,
            force: options.force,
            default: false,
        });
        if (!prompt) {
            throw new error_1.FirebaseError("Command aborted", { exit: 1 });
        }
    }
    utils.logBullet(`Exporting data to: ${exportAbsPath}`);
    try {
        await hubClient.postExport({ path: exportAbsPath, initiatedBy });
    }
    catch (e) {
        throw new error_1.FirebaseError("Export request failed, see emulator logs for more information.", {
            exit: 1,
            original: e,
        });
    }
    utils.logSuccess("Export complete");
}
exports.exportEmulatorData = exportEmulatorData;
