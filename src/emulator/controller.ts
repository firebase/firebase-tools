import * as clc from "colorette";
import * as fs from "fs";
import * as path from "path";
import * as fsConfig from "../firestore/fsConfig";

import { logger } from "../logger";
import { trackEmulator, trackGA4 } from "../track";
import * as utils from "../utils";
import { EmulatorRegistry } from "./registry";
import {
  ALL_EMULATORS,
  ALL_SERVICE_EMULATORS,
  EmulatorInfo,
  EmulatorInstance,
  Emulators,
  EMULATORS_SUPPORTED_BY_UI,
  isEmulator,
} from "./types";
import { Constants, FIND_AVAILBLE_PORT_BY_DEFAULT } from "./constants";
import { EmulatableBackend, FunctionsEmulator } from "./functionsEmulator";
import { AuthEmulator, SingleProjectMode } from "./auth";
import { DatabaseEmulator, DatabaseEmulatorArgs } from "./databaseEmulator";
import { FirestoreEmulator, FirestoreEmulatorArgs } from "./firestoreEmulator";
import { HostingEmulator } from "./hostingEmulator";
import { EventarcEmulator } from "./eventarcEmulator";
import { FirebaseError } from "../error";
import { getProjectId, needProjectId, getAliases, needProjectNumber } from "../projectUtils";
import { PubsubEmulator } from "./pubsubEmulator";
import * as commandUtils from "./commandUtils";
import { EmulatorHub } from "./hub";
import { ExportMetadata, HubExport } from "./hubExport";
import { EmulatorUI } from "./ui";
import { LoggingEmulator } from "./loggingEmulator";
import * as dbRulesConfig from "../database/rulesConfig";
import { EmulatorLogger, Verbosity } from "./emulatorLogger";
import { EmulatorHubClient } from "./hubClient";
import { confirm } from "../prompt";
import {
  FLAG_EXPORT_ON_EXIT_NAME,
  JAVA_DEPRECATION_WARNING,
  MIN_SUPPORTED_JAVA_MAJOR_VERSION,
} from "./commandUtils";
import { fileExistsSync } from "../fsutils";
import { StorageEmulator } from "./storage";
import { getStorageRulesConfig } from "./storage/rules/config";
import { getDefaultDatabaseInstance } from "../getDefaultDatabaseInstance";
import { getProjectDefaultAccount } from "../auth";
import { Options } from "../options";
import { ParsedTriggerDefinition } from "./functionsEmulatorShared";
import { ExtensionsEmulator } from "./extensionsEmulator";
import { normalizeAndValidate } from "../functions/projectConfig";
import { requiresJava } from "./downloadableEmulators";
import { prepareFrameworks } from "../frameworks";
import * as experiments from "../experiments";
import { EmulatorListenConfig, PortName, resolveHostAndAssignPorts } from "./portUtils";

const START_LOGGING_EMULATOR = utils.envOverride(
  "START_LOGGING_EMULATOR",
  "false",
  (val) => val === "true",
);

/**
 * Exports emulator data on clean exit (SIGINT or process end)
 * @param options
 */
export async function exportOnExit(options: any) {
  const exportOnExitDir = options.exportOnExit;
  if (exportOnExitDir) {
    try {
      utils.logBullet(
        `Automatically exporting data using ${FLAG_EXPORT_ON_EXIT_NAME} "${exportOnExitDir}" ` +
          "please wait for the export to finish...",
      );
      await exportEmulatorData(exportOnExitDir, options, /* initiatedBy= */ "exit");
    } catch (e: any) {
      utils.logWarning(e);
      utils.logWarning(`Automatic export to "${exportOnExitDir}" failed, going to exit now...`);
    }
  }
}

/**
 * Hook to do things when we're exiting cleanly (this does not include errors). Will be skipped on a second SIGINT
 * @param options
 */
export async function onExit(options: any) {
  await exportOnExit(options);
}

/**
 * Hook to clean up on shutdown (includes errors). Will be skipped on a third SIGINT
 * Stops all running emulators in parallel.
 */
export async function cleanShutdown(): Promise<void> {
  EmulatorLogger.forEmulator(Emulators.HUB).logLabeled(
    "BULLET",
    "emulators",
    "Shutting down emulators.",
  );
  await EmulatorRegistry.stopAll();
}

/**
 * Filters a list of emulators to only those specified in the config
 * @param options
 */
export function filterEmulatorTargets(options: { only: string; config: any }): Emulators[] {
  let targets = [...ALL_SERVICE_EMULATORS];
  targets.push(Emulators.EXTENSIONS);
  targets = targets.filter((e) => {
    return options.config.has(e) || options.config.has(`emulators.${e}`);
  });

  const onlyOptions: string = options.only;
  if (onlyOptions) {
    const only = onlyOptions.split(",").map((o) => {
      return o.split(":")[0];
    });
    targets = targets.filter((t) => only.includes(t));
  }

  return targets;
}

/**
 * Returns whether or not a specific emulator should start based on configuration and dependencies.
 * @param options
 * @param name
 */
export function shouldStart(options: Options, name: Emulators): boolean {
  if (name === Emulators.HUB) {
    // The hub only starts if we know the project ID.
    return !!options.project;
  }
  const targets = filterEmulatorTargets(options);
  const emulatorInTargets = targets.includes(name);

  if (name === Emulators.UI) {
    if (options.ui) {
      return true;
    }

    if (options.config.src.emulators?.ui?.enabled === false) {
      // Allow disabling UI via `{emulators: {"ui": {"enabled": false}}}`.
      // Emulator UI is by default enabled if that option is not specified.
      return false;
    }
    // Emulator UI only starts if we know the project ID AND at least one
    // emulator supported by Emulator UI is launching.
    return (
      !!options.project && targets.some((target) => EMULATORS_SUPPORTED_BY_UI.includes(target))
    );
  }

  // Don't start the functions emulator if we can't find the source directory
  if (name === Emulators.FUNCTIONS && emulatorInTargets) {
    try {
      normalizeAndValidate(options.config.src.functions);
      return true;
    } catch (err: any) {
      EmulatorLogger.forEmulator(Emulators.FUNCTIONS).logLabeled(
        "WARN",
        "functions",
        `The functions emulator is configured but there is no functions source directory. Have you run ${clc.bold(
          "firebase init functions",
        )}?`,
      );
      return false;
    }
  }

  if (name === Emulators.HOSTING && emulatorInTargets && !options.config.get("hosting")) {
    EmulatorLogger.forEmulator(Emulators.HOSTING).logLabeled(
      "WARN",
      "hosting",
      `The hosting emulator is configured but there is no hosting configuration. Have you run ${clc.bold(
        "firebase init hosting",
      )}?`,
    );
    return false;
  }

  return emulatorInTargets;
}

function findExportMetadata(importPath: string): ExportMetadata | undefined {
  const pathExists = fs.existsSync(importPath);
  if (!pathExists) {
    throw new FirebaseError(`Directory "${importPath}" does not exist.`);
  }

  const pathIsDirectory = fs.lstatSync(importPath).isDirectory();
  if (!pathIsDirectory) {
    return;
  }

  // If there is an export metadata file, we always prefer that
  const importFilePath = path.join(importPath, HubExport.METADATA_FILE_NAME);
  if (fileExistsSync(importFilePath)) {
    return JSON.parse(fs.readFileSync(importFilePath, "utf8").toString()) as ExportMetadata;
  }

  const fileList = fs.readdirSync(importPath);

  // The user might have passed a Firestore export directly
  const firestoreMetadataFile = fileList.find((f) => f.endsWith(".overall_export_metadata"));
  if (firestoreMetadataFile) {
    const metadata: ExportMetadata = {
      version: EmulatorHub.CLI_VERSION,
      firestore: {
        version: "prod",
        path: importPath,
        metadata_file: `${importPath}/${firestoreMetadataFile}`,
      },
    };

    EmulatorLogger.forEmulator(Emulators.FIRESTORE).logLabeled(
      "BULLET",
      "firestore",
      `Detected non-emulator Firestore export at ${importPath}`,
    );

    return metadata;
  }

  // The user might haved passed a directory containing RTDB json files
  const rtdbDataFile = fileList.find((f) => f.endsWith(".json"));
  if (rtdbDataFile) {
    const metadata: ExportMetadata = {
      version: EmulatorHub.CLI_VERSION,
      database: {
        version: "prod",
        path: importPath,
      },
    };

    EmulatorLogger.forEmulator(Emulators.DATABASE).logLabeled(
      "BULLET",
      "firestore",
      `Detected non-emulator Database export at ${importPath}`,
    );

    return metadata;
  }
}

interface EmulatorOptions extends Options {
  extDevEnv?: Record<string, string>;
  logVerbosity?: "DEBUG" | "INFO" | "QUIET" | "SILENT";
}

/**
 * Start all emulators.
 */
export async function startAll(
  options: EmulatorOptions,
  showUI = true,
  runningTestScript = false,
): Promise<{ deprecationNotices: string[] }> {
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
  const singleProjectModeEnabled =
    options.config.src.emulators?.singleProjectMode === undefined ||
    options.config.src.emulators?.singleProjectMode;

  if (targets.length === 0) {
    throw new FirebaseError(
      `No emulators to start, run ${clc.bold("firebase init emulators")} to get started.`,
    );
  }
  if (targets.some(requiresJava)) {
    if ((await commandUtils.checkJavaMajorVersion()) < MIN_SUPPORTED_JAVA_MAJOR_VERSION) {
      utils.logLabeledError("emulators", JAVA_DEPRECATION_WARNING, "warn");
      throw new FirebaseError(JAVA_DEPRECATION_WARNING);
    }
  }
  if (options.logVerbosity) {
    EmulatorLogger.setVerbosity(Verbosity[options.logVerbosity]);
  }

  const hubLogger = EmulatorLogger.forEmulator(Emulators.HUB);
  hubLogger.logLabeled("BULLET", "emulators", `Starting emulators: ${targets.join(", ")}`);

  const projectId: string = getProjectId(options) || ""; // TODO: Next breaking change, consider making this fall back to demo project.
  const isDemoProject = Constants.isDemoProject(projectId);
  if (isDemoProject) {
    hubLogger.logLabeled(
      "BULLET",
      "emulators",
      `Detected demo project ID "${projectId}", emulated services will use a demo configuration and attempts to access non-emulated services for this project will fail.`,
    );
  }

  const onlyOptions: string = options.only;
  if (onlyOptions) {
    const requested: string[] = onlyOptions.split(",").map((o) => {
      return o.split(":")[0];
    });
    const ignored = requested.filter((k) => !targets.includes(k as Emulators));

    for (const name of ignored) {
      if (isEmulator(name)) {
        EmulatorLogger.forEmulator(name).logLabeled(
          "WARN",
          name,
          `Not starting the ${clc.bold(name)} emulator, make sure you have run ${clc.bold(
            "firebase init",
          )}.`,
        );
      } else {
        // this should not work:
        // firebase emulators:start --only doesnotexist
        throw new FirebaseError(
          `${name} is not a valid emulator name, valid options are: ${JSON.stringify(
            ALL_SERVICE_EMULATORS,
          )}`,
          { exit: 1 },
        );
      }
    }
  }

  const emulatableBackends: EmulatableBackend[] = [];

  // Process extensions config early so that we have a better guess at whether
  // the Functions emulator needs to start.
  let extensionEmulator: ExtensionsEmulator | undefined = undefined;
  if (shouldStart(options, Emulators.EXTENSIONS)) {
    const projectNumber = isDemoProject
      ? Constants.FAKE_PROJECT_NUMBER
      : await needProjectNumber(options);
    const aliases = getAliases(options, projectId);
    extensionEmulator = new ExtensionsEmulator({
      projectId,
      projectDir: options.config.projectDir,
      projectNumber,
      aliases,
      extensions: options.config.get("extensions"),
    });
    const extensionsBackends = await extensionEmulator.getExtensionBackends();
    const filteredExtensionsBackends = extensionEmulator.filterUnemulatedTriggers(
      options,
      extensionsBackends,
    );
    emulatableBackends.push(...filteredExtensionsBackends);
    trackGA4("extensions_emulated", {
      number_of_extensions_emulated: filteredExtensionsBackends.length,
      number_of_extensions_ignored: extensionsBackends.length - filteredExtensionsBackends.length,
    });
  }

  const listenConfig = {} as Record<PortName, EmulatorListenConfig>;
  if (emulatableBackends.length) {
    // If we already know we need Functions (and Eventarc), assign them now.
    listenConfig[Emulators.FUNCTIONS] = getListenConfig(options, Emulators.FUNCTIONS);
    listenConfig[Emulators.EVENTARC] = getListenConfig(options, Emulators.EVENTARC);
  }
  for (const emulator of ALL_EMULATORS) {
    if (
      emulator === Emulators.FUNCTIONS ||
      emulator === Emulators.EVENTARC ||
      // Same port as Functions, no need for separate assignment
      emulator === Emulators.EXTENSIONS ||
      (emulator === Emulators.UI && !showUI)
    ) {
      continue;
    }
    if (
      shouldStart(options, emulator) ||
      (emulator === Emulators.LOGGING &&
        ((showUI && shouldStart(options, Emulators.UI)) || START_LOGGING_EMULATOR))
    ) {
      const config = getListenConfig(options, emulator);
      listenConfig[emulator] = config;
      if (emulator === Emulators.FIRESTORE) {
        const wsPortConfig = options.config.src.emulators?.firestore?.websocketPort;
        listenConfig["firestore.websocket"] = {
          host: config.host,
          port: wsPortConfig || 9150,
          portFixed: !!wsPortConfig,
        };
      }
    }
  }
  let listenForEmulator = await resolveHostAndAssignPorts(listenConfig);
  hubLogger.log("DEBUG", "assigned listening specs for emulators", { user: listenForEmulator });

  function legacyGetFirstAddr(name: PortName): { host: string; port: number } {
    const firstSpec = listenForEmulator[name][0];
    return {
      host: firstSpec.address,
      port: firstSpec.port,
    };
  }

  function startEmulator(instance: EmulatorInstance): Promise<void> {
    const name = instance.getName();

    // Log the command for analytics
    void trackEmulator("emulator_run", {
      emulator_name: name,
      is_demo_project: String(isDemoProject),
    });

    return EmulatorRegistry.start(instance);
  }

  if (listenForEmulator.hub) {
    const hub = new EmulatorHub({
      projectId,
      listen: listenForEmulator[Emulators.HUB],
      listenForEmulator,
    });

    // Log the command for analytics, we only report this for "hub"
    // since we originally mistakenly reported emulators:start events
    // for each emulator, by reporting the "hub" we ensure that our
    // historical data can still be viewed.
    await startEmulator(hub);
  }

  // Parse export metadata
  let exportMetadata: ExportMetadata = {
    version: "unknown",
  };
  if (options.import) {
    utils.assertIsString(options.import);
    const importDir = path.resolve(options.import);
    const foundMetadata = findExportMetadata(importDir);
    if (foundMetadata) {
      exportMetadata = foundMetadata;
      void trackEmulator("emulator_import", {
        initiated_by: "start",
        emulator_name: Emulators.HUB,
      });
    } else {
      hubLogger.logLabeled(
        "WARN",
        "emulators",
        `Could not find import/export metadata file, ${clc.bold("skipping data import!")}`,
      );
    }
  }

  // TODO: turn this into hostingConfig.extract or hostingConfig.hostingConfig
  // once those branches merge
  const hostingConfig = options.config.get("hosting");
  if (
    Array.isArray(hostingConfig) ? hostingConfig.some((it) => it.source) : hostingConfig?.source
  ) {
    experiments.assertEnabled("webframeworks", "emulate a web framework");
    const emulators: EmulatorInfo[] = [];
    for (const e of ALL_SERVICE_EMULATORS) {
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
    await prepareFrameworks(
      runningTestScript ? "test" : "emulate",
      targets,
      undefined,
      options,
      emulators,
    );
  }

  const projectDir = (options.extDevDir || options.config.projectDir) as string;
  if (shouldStart(options, Emulators.FUNCTIONS)) {
    const functionsCfg = normalizeAndValidate(options.config.src.functions);
    // Note: ext:dev:emulators:* commands hit this path, not the Emulators.EXTENSIONS path
    utils.assertIsStringOrUndefined(options.extDevDir);

    for (const cfg of functionsCfg) {
      const functionsDir = path.join(projectDir, cfg.source);
      const runtime = (options.extDevRuntime as string | undefined) ?? cfg.runtime;
      emulatableBackends.push({
        functionsDir,
        runtime,
        codebase: cfg.codebase,
        env: {
          ...options.extDevEnv,
        },
        secretEnv: [], // CF3 secrets are bound to specific functions, so we'll get them during trigger discovery.
        // TODO(b/213335255): predefinedTriggers and nodeMajorVersion are here to support ext:dev:emulators:* commands.
        // Ideally, we should handle that case via ExtensionEmulator.
        predefinedTriggers: options.extDevTriggers as ParsedTriggerDefinition[] | undefined,
      });
    }
  }

  if (extensionEmulator) {
    await startEmulator(extensionEmulator);
  }

  if (emulatableBackends.length) {
    if (!listenForEmulator.functions || !listenForEmulator.eventarc) {
      // We did not know that we need Functions and Eventarc earlier but now we do.
      listenForEmulator = await resolveHostAndAssignPorts({
        ...listenForEmulator,
        functions: listenForEmulator.functions ?? getListenConfig(options, Emulators.FUNCTIONS),
        eventarc: listenForEmulator.eventarc ?? getListenConfig(options, Emulators.EVENTARC),
      });
      hubLogger.log("DEBUG", "late-assigned ports for functions and eventarc emulators", {
        user: listenForEmulator,
      });
    }
    const functionsLogger = EmulatorLogger.forEmulator(Emulators.FUNCTIONS);
    const functionsAddr = legacyGetFirstAddr(Emulators.FUNCTIONS);
    const projectId = needProjectId(options);

    let inspectFunctions: number | undefined;
    if (options.inspectFunctions) {
      inspectFunctions = commandUtils.parseInspectionPort(options);

      // TODO(samstern): Add a link to documentation
      functionsLogger.logLabeled(
        "WARN",
        "functions",
        `You are running the Functions emulator in debug mode (port=${inspectFunctions}). This means that functions will execute in sequence rather than in parallel.`,
      );
    }

    // Warn the developer that the Functions/Extensions emulator can call out to production.
    const emulatorsNotRunning = ALL_SERVICE_EMULATORS.filter((e) => {
      return e !== Emulators.FUNCTIONS && !listenForEmulator[e];
    });
    if (emulatorsNotRunning.length > 0 && !Constants.isDemoProject(projectId)) {
      functionsLogger.logLabeled(
        "WARN",
        "functions",
        `The following emulators are not running, calls to these services from the Functions emulator will affect production: ${clc.bold(
          emulatorsNotRunning.join(", "),
        )}`,
      );
    }

    const account = getProjectDefaultAccount(options.projectRoot);

    // TODO(b/213241033): Figure out how to watch for changes to extensions .env files & reload triggers when they change.
    const functionsEmulator = new FunctionsEmulator({
      projectId,
      projectDir,
      emulatableBackends,
      account,
      host: functionsAddr.host,
      port: functionsAddr.port,
      debugPort: inspectFunctions,
      verbosity: options.logVerbosity,
      projectAlias: options.projectAlias,
    });
    await startEmulator(functionsEmulator);

    const eventarcAddr = legacyGetFirstAddr(Emulators.EVENTARC);
    const eventarcEmulator = new EventarcEmulator({
      host: eventarcAddr.host,
      port: eventarcAddr.port,
    });
    await startEmulator(eventarcEmulator);
  }

  if (listenForEmulator.firestore) {
    const firestoreLogger = EmulatorLogger.forEmulator(Emulators.FIRESTORE);
    const firestoreAddr = legacyGetFirstAddr(Emulators.FIRESTORE);
    const websocketPort = legacyGetFirstAddr("firestore.websocket").port;

    const args: FirestoreEmulatorArgs = {
      host: firestoreAddr.host,
      port: firestoreAddr.port,
      websocket_port: websocketPort,
      project_id: projectId,
      auto_download: true,
    };

    if (exportMetadata.firestore) {
      utils.assertIsString(options.import);
      const importDirAbsPath = path.resolve(options.import);
      const exportMetadataFilePath = path.resolve(
        importDirAbsPath,
        exportMetadata.firestore.metadata_file,
      );

      firestoreLogger.logLabeled(
        "BULLET",
        "firestore",
        `Importing data from ${exportMetadataFilePath}`,
      );
      args.seed_from_export = exportMetadataFilePath;
      void trackEmulator("emulator_import", {
        initiated_by: "start",
        emulator_name: Emulators.FIRESTORE,
      });
    }

    const config = options.config;
    // emulator does not support multiple databases yet
    // TODO(VicVer09): b/269787702
    let rulesLocalPath;
    let rulesFileFound;
    const firestoreConfigs: fsConfig.ParsedFirestoreConfig[] = fsConfig.getFirestoreConfig(
      projectId,
      options,
    );
    if (!firestoreConfigs) {
      firestoreLogger.logLabeled(
        "WARN",
        "firestore",
        `Cloud Firestore config does not exist in firebase.json.`,
      );
    } else if (firestoreConfigs.length !== 1) {
      firestoreLogger.logLabeled(
        "WARN",
        "firestore",
        `Cloud Firestore Emulator does not support multiple databases yet.`,
      );
    } else if (firestoreConfigs[0].rules) {
      rulesLocalPath = firestoreConfigs[0].rules;
    }
    if (rulesLocalPath) {
      const rules: string = config.path(rulesLocalPath);
      rulesFileFound = fs.existsSync(rules);
      if (rulesFileFound) {
        args.rules = rules;
      } else {
        firestoreLogger.logLabeled(
          "WARN",
          "firestore",
          `Cloud Firestore rules file ${clc.bold(rules)} specified in firebase.json does not exist.`,
        );
      }
    } else {
      firestoreLogger.logLabeled(
        "WARN",
        "firestore",
        "Did not find a Cloud Firestore rules file specified in a firebase.json config file.",
      );
    }

    if (!rulesFileFound) {
      firestoreLogger.logLabeled(
        "WARN",
        "firestore",
        "The emulator will default to allowing all reads and writes. Learn more about this option: https://firebase.google.com/docs/emulator-suite/install_and_configure#security_rules_configuration.",
      );
    }

    // undefined in the config defaults to setting single_project_mode.
    if (singleProjectModeEnabled) {
      if (projectId) {
        args.single_project_mode = true;
        args.single_project_mode_error = false;
      } else {
        firestoreLogger.logLabeled(
          "DEBUG",
          "firestore",
          "Could not enable single_project_mode: missing projectId.",
        );
      }
    }

    const firestoreEmulator = new FirestoreEmulator(args);
    await startEmulator(firestoreEmulator);
    firestoreLogger.logLabeled(
      "SUCCESS",
      Emulators.FIRESTORE,
      `Firestore Emulator UI websocket is running on ${websocketPort}.`,
    );
  }

  if (listenForEmulator.database) {
    const databaseLogger = EmulatorLogger.forEmulator(Emulators.DATABASE);
    const databaseAddr = legacyGetFirstAddr(Emulators.DATABASE);

    const args: DatabaseEmulatorArgs = {
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
        options.instance = await getDefaultDatabaseInstance(options);
      }
    } catch (e: any) {
      databaseLogger.log(
        "DEBUG",
        `Failed to retrieve default database instance: ${JSON.stringify(e)}`,
      );
    }

    const rc = dbRulesConfig.normalizeRulesConfig(
      dbRulesConfig.getRulesConfig(projectId, options),
      options,
    );
    logger.debug("database rules config: ", JSON.stringify(rc));

    args.rules = rc;

    if (rc.length === 0) {
      databaseLogger.logLabeled(
        "WARN",
        "database",
        "Did not find a Realtime Database rules file specified in a firebase.json config file. The emulator will default to allowing all reads and writes. Learn more about this option: https://firebase.google.com/docs/emulator-suite/install_and_configure#security_rules_configuration.",
      );
    } else {
      for (const c of rc) {
        const rules: string = c.rules;
        if (!fs.existsSync(rules)) {
          databaseLogger.logLabeled(
            "WARN",
            "database",
            `Realtime Database rules file ${clc.bold(
              rules,
            )} specified in firebase.json does not exist.`,
          );
        }
      }
    }

    const databaseEmulator = new DatabaseEmulator(args);
    await startEmulator(databaseEmulator);

    if (exportMetadata.database) {
      utils.assertIsString(options.import);
      const importDirAbsPath = path.resolve(options.import);
      const databaseExportDir = path.resolve(importDirAbsPath, exportMetadata.database.path);

      const files = fs.readdirSync(databaseExportDir).filter((f) => f.endsWith(".json"));
      void trackEmulator("emulator_import", {
        initiated_by: "start",
        emulator_name: Emulators.DATABASE,
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
    if (!projectId) {
      throw new FirebaseError(
        `Cannot start the ${Constants.description(
          Emulators.AUTH,
        )} without a project: run 'firebase init' or provide the --project flag`,
      );
    }

    const authAddr = legacyGetFirstAddr(Emulators.AUTH);
    const authEmulator = new AuthEmulator({
      host: authAddr.host,
      port: authAddr.port,
      projectId,
      singleProjectMode: singleProjectModeEnabled
        ? SingleProjectMode.WARNING
        : SingleProjectMode.NO_WARNING,
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
    if (!projectId) {
      throw new FirebaseError(
        "Cannot start the Pub/Sub emulator without a project: run 'firebase init' or provide the --project flag",
      );
    }

    const pubsubAddr = legacyGetFirstAddr(Emulators.PUBSUB);
    const pubsubEmulator = new PubsubEmulator({
      host: pubsubAddr.host,
      port: pubsubAddr.port,
      projectId,
      auto_download: true,
    });
    await startEmulator(pubsubEmulator);
  }

  if (listenForEmulator.storage) {
    const storageAddr = legacyGetFirstAddr(Emulators.STORAGE);

    const storageEmulator = new StorageEmulator({
      host: storageAddr.host,
      port: storageAddr.port,
      projectId: projectId,
      rules: getStorageRulesConfig(projectId, options),
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
    const hostingAddr = legacyGetFirstAddr(Emulators.HOSTING);
    const hostingEmulator = new HostingEmulator({
      host: hostingAddr.host,
      port: hostingAddr.port,
      options,
    });

    await startEmulator(hostingEmulator);
  }

  if (listenForEmulator.logging) {
    const loggingAddr = legacyGetFirstAddr(Emulators.LOGGING);
    const loggingEmulator = new LoggingEmulator({
      host: loggingAddr.host,
      port: loggingAddr.port,
    });

    await startEmulator(loggingEmulator);
  }

  if (showUI && !shouldStart(options, Emulators.UI)) {
    hubLogger.logLabeled(
      "WARN",
      "emulators",
      "The Emulator UI is not starting, either because none of the running " +
        "emulators have a UI component or the Emulator UI cannot " +
        "determine the Project ID. Pass the --project flag to specify a project.",
    );
  }

  if (listenForEmulator.ui) {
    const ui = new EmulatorUI({
      projectId: projectId,
      auto_download: true,
      listen: listenForEmulator[Emulators.UI],
    });
    await startEmulator(ui);
  }

  let serviceEmulatorCount = 0;
  const running = EmulatorRegistry.listRunning();
  for (const name of running) {
    const instance = EmulatorRegistry.get(name);
    if (instance) {
      await instance.connect();
    }
    if (ALL_SERVICE_EMULATORS.includes(name)) {
      serviceEmulatorCount++;
    }
  }

  void trackEmulator("emulators_started", {
    count: serviceEmulatorCount,
    count_all: running.length,
    is_demo_project: String(isDemoProject),
  });

  return { deprecationNotices: [] };
}

function getListenConfig(
  options: EmulatorOptions,
  emulator: Exclude<Emulators, Emulators.EXTENSIONS>,
): EmulatorListenConfig {
  let host = options.config.src.emulators?.[emulator]?.host || Constants.getDefaultHost();
  if (host === "localhost" && utils.isRunningInWSL()) {
    // HACK(https://github.com/firebase/firebase-tools-ui/issues/332): Use IPv4
    // 127.0.0.1 instead of localhost. This, combined with the hack in
    // downloadableEmulators.ts, forces the emulator to listen on IPv4 ONLY.
    // The CLI (including the hub) will also consistently report 127.0.0.1,
    // causing clients to connect via IPv4 only (which mitigates the problem of
    // some clients resolving localhost to IPv6 and get connection refused).
    host = "127.0.0.1";
  }

  const portVal = options.config.src.emulators?.[emulator]?.port;
  let port: number;
  let portFixed: boolean;
  if (portVal) {
    port = parseInt(`${portVal}`, 10);
    portFixed = true;
  } else {
    port = Constants.getDefaultPort(emulator);
    portFixed = !FIND_AVAILBLE_PORT_BY_DEFAULT[emulator];
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
export async function exportEmulatorData(exportPath: string, options: any, initiatedBy: string) {
  const projectId = options.project;
  if (!projectId) {
    throw new FirebaseError(
      "Could not determine project ID, make sure you're running in a Firebase project directory or add the --project flag.",
      { exit: 1 },
    );
  }

  const hubClient = new EmulatorHubClient(projectId);
  if (!hubClient.foundHub()) {
    throw new FirebaseError(
      `Did not find any running emulators for project ${clc.bold(projectId)}.`,
      { exit: 1 },
    );
  }

  let origin;
  try {
    origin = await hubClient.getStatus();
  } catch (e: any) {
    const filePath = EmulatorHub.getLocatorFilePath(projectId);
    throw new FirebaseError(
      `The emulator hub for ${projectId} did not respond to a status check. If this error continues try shutting down all running emulators and deleting the file ${filePath}`,
      { exit: 1 },
    );
  }

  utils.logBullet(`Found running emulator hub for project ${clc.bold(projectId)} at ${origin}`);

  // If the export target directory does not exist, we should attempt to create it
  const exportAbsPath = path.resolve(exportPath);
  if (!fs.existsSync(exportAbsPath)) {
    utils.logBullet(`Creating export directory ${exportAbsPath}`);
    fs.mkdirSync(exportAbsPath);
  }

  // Check if there is already an export there and prompt the user about deleting it
  const existingMetadata = HubExport.readMetadata(exportAbsPath);
  const isExportDirEmpty = fs.readdirSync(exportAbsPath).length === 0;
  if ((existingMetadata || !isExportDirEmpty) && !(options.force || options.exportOnExit)) {
    if (options.noninteractive) {
      throw new FirebaseError(
        "Export already exists in the target directory, re-run with --force to overwrite.",
        { exit: 1 },
      );
    }

    const prompt = await confirm({
      message: `The directory ${exportAbsPath} is not empty. Existing files in this directory will be overwritten. Do you want to continue?`,
      nonInteractive: options.nonInteractive,
      force: options.force,
      default: false,
    });

    if (!prompt) {
      throw new FirebaseError("Command aborted", { exit: 1 });
    }
  }

  utils.logBullet(`Exporting data to: ${exportAbsPath}`);
  try {
    await hubClient.postExport({ path: exportAbsPath, initiatedBy });
  } catch (e: any) {
    throw new FirebaseError("Export request failed, see emulator logs for more information.", {
      exit: 1,
      original: e,
    });
  }

  utils.logSuccess("Export complete");
}
