import * as _ from "lodash";
import * as clc from "cli-color";
import * as fs from "fs";
import * as path from "path";

import * as Config from "../config";
import * as logger from "../logger";
import * as track from "../track";
import * as utils from "../utils";
import { EmulatorRegistry } from "./registry";
import {
  Address,
  ALL_SERVICE_EMULATORS,
  EmulatorInstance,
  Emulators,
  EMULATORS_SUPPORTED_BY_UI,
  isEmulator,
} from "./types";
import { Constants, FIND_AVAILBLE_PORT_BY_DEFAULT } from "./constants";
import { FunctionsEmulator } from "./functionsEmulator";
import { parseRuntimeVersion } from "./functionsEmulatorUtils";
import { AuthEmulator } from "./auth";
import { DatabaseEmulator, DatabaseEmulatorArgs } from "./databaseEmulator";
import { FirestoreEmulator, FirestoreEmulatorArgs } from "./firestoreEmulator";
import { HostingEmulator } from "./hostingEmulator";
import { FirebaseError } from "../error";
import * as getProjectId from "../getProjectId";
import { PubsubEmulator } from "./pubsubEmulator";
import * as commandUtils from "./commandUtils";
import { EmulatorHub } from "./hub";
import { ExportMetadata, HubExport } from "./hubExport";
import { EmulatorUI } from "./ui";
import { LoggingEmulator } from "./loggingEmulator";
import * as dbRulesConfig from "../database/rulesConfig";
import { EmulatorLogger } from "./emulatorLogger";
import * as portUtils from "./portUtils";
import { EmulatorHubClient } from "./hubClient";
import { promptOnce } from "../prompt";
import * as rimraf from "rimraf";
import { FLAG_EXPORT_ON_EXIT_NAME } from "./commandUtils";
import { fileExistsSync } from "../fsutils";

async function getAndCheckAddress(emulator: Emulators, options: any): Promise<Address> {
  let host = Constants.normalizeHost(
    options.config.get(Constants.getHostKey(emulator), Constants.getDefaultHost(emulator))
  );

  if (host === "localhost" && utils.isRunningInWSL()) {
    // HACK(https://github.com/firebase/firebase-tools-ui/issues/332): Use IPv4
    // 127.0.0.1 instead of localhost. This, combined with the hack in
    // downloadableEmulators.ts, forces the emulator to listen on IPv4 ONLY.
    // The CLI (including the hub) will also consistently report 127.0.0.1,
    // causing clients to connect via IPv4 only (which mitigates the problem of
    // some clients resolving localhost to IPv6 and get connection refused).
    host = "127.0.0.1";
  }

  const portVal = options.config.get(Constants.getPortKey(emulator), undefined);
  let port;
  let findAvailablePort = false;
  if (portVal) {
    port = parseInt(portVal, 10);
  } else {
    port = Constants.getDefaultPort(emulator);
    findAvailablePort = FIND_AVAILBLE_PORT_BY_DEFAULT[emulator];
  }

  const loggerForEmulator = EmulatorLogger.forEmulator(emulator);
  const portOpen = await portUtils.checkPortOpen(port, host);
  if (!portOpen) {
    if (findAvailablePort) {
      const newPort = await portUtils.findAvailablePort(host, port);
      if (newPort != port) {
        loggerForEmulator.logLabeled(
          "WARN",
          emulator,
          `${Constants.description(
            emulator
          )} unable to start on port ${port}, starting on ${newPort} instead.`
        );
        port = newPort;
      }
    } else {
      await cleanShutdown();
      const description = Constants.description(emulator);
      loggerForEmulator.logLabeled(
        "WARN",
        emulator,
        `Port ${port} is not open on ${host}, could not start ${description}.`
      );
      loggerForEmulator.logLabeled(
        "WARN",
        emulator,
        `To select a different host/port, specify that host/port in a firebase.json config file:
      {
        // ...
        "emulators": {
          "${emulator}": {
            "host": "${clc.yellow("HOST")}",
            "port": "${clc.yellow("PORT")}"
          }
        }
      }`
      );
      return utils.reject(`Could not start ${description}, port taken.`, {});
    }
  }

  if (portUtils.isRestricted(port)) {
    const suggested = portUtils.suggestUnrestricted(port);
    loggerForEmulator.logLabeled(
      "WARN",
      emulator,
      `Port ${port} is restricted by some web browsers, including Chrome. You may want to choose a different port such as ${suggested}.`
    );
  }

  return { host, port };
}

export async function startEmulator(instance: EmulatorInstance): Promise<void> {
  const name = instance.getName();

  // Log the command for analytics
  track("emulators:start", name);

  await EmulatorRegistry.start(instance);
}

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
          "please wait for the export to finish..."
      );
      await exportEmulatorData(exportOnExitDir, options);
    } catch (e) {
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
    "Shutting down emulators."
  );
  await EmulatorRegistry.stopAll();
}

export function filterEmulatorTargets(options: any): Emulators[] {
  let targets = ALL_SERVICE_EMULATORS.filter((e) => {
    return options.config.has(e) || options.config.has(`emulators.${e}`);
  });

  if (options.only) {
    targets = _.intersection(targets, options.only.split(","));
  }

  return targets;
}

export function shouldStart(options: any, name: Emulators): boolean {
  if (name === Emulators.HUB) {
    // The hub only starts if we know the project ID.
    return !!options.project;
  }
  const targets = filterEmulatorTargets(options);
  const emulatorInTargets = targets.indexOf(name) >= 0;

  if (name === Emulators.UI) {
    if (options.ui) {
      return true;
    }

    if (options.config.get("emulators.ui.enabled") === false) {
      // Allow disabling UI via `{emulators: {"ui": {"enabled": false}}}`.
      // Emulator UI is by default enabled if that option is not specified.
      return false;
    }
    // Emulator UI only starts if we know the project ID AND at least one
    // emulator supported by Emulator UI is launching.
    return (
      !!options.project && targets.some((target) => EMULATORS_SUPPORTED_BY_UI.indexOf(target) >= 0)
    );
  }

  // Don't start the functions emulator if we can't find the source directory
  if (
    name === Emulators.FUNCTIONS &&
    emulatorInTargets &&
    !options.config.get("functions.source")
  ) {
    EmulatorLogger.forEmulator(Emulators.FUNCTIONS).logLabeled(
      "WARN",
      "functions",
      `The functions emulator is configured but there is no functions source directory. Have you run ${clc.bold(
        "firebase init functions"
      )}?`
    );
    return false;
  }

  if (name === Emulators.HOSTING && emulatorInTargets && !options.config.get("hosting")) {
    EmulatorLogger.forEmulator(Emulators.HOSTING).logLabeled(
      "WARN",
      "hosting",
      `The hosting emulator is configured but there is no hosting configuration. Have you run ${clc.bold(
        "firebase init hosting"
      )}?`
    );
    return false;
  }

  return emulatorInTargets;
}

function findExportMetadata(importPath: string): ExportMetadata | undefined {
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
      `Detected non-emulator Firestore export at ${importPath}`
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
      `Detected non-emulator Database export at ${importPath}`
    );

    return metadata;
  }
}

export async function startAll(options: any, noUi: boolean = false): Promise<void> {
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

  const projectId: string | undefined = getProjectId(options, true);

  EmulatorLogger.forEmulator(Emulators.HUB).logLabeled(
    "BULLET",
    "emulators",
    `Starting emulators: ${targets.join(", ")}`
  );
  if (options.only) {
    const requested: string[] = options.only.split(",");
    const ignored = _.difference(requested, targets);

    for (const name of ignored) {
      if (isEmulator(name)) {
        EmulatorLogger.forEmulator(name as Emulators).logLabeled(
          "WARN",
          name,
          `Not starting the ${clc.bold(name)} emulator, make sure you have run ${clc.bold(
            "firebase init"
          )}.`
        );
      } else {
        // this should not work:
        // firebase emulators:start --only doesnotexit
        throw new FirebaseError(
          `${name} is not a valid emulator name, valid options are: ${JSON.stringify(
            ALL_SERVICE_EMULATORS
          )}`,
          { exit: 1 }
        );
      }
    }
  }

  if (shouldStart(options, Emulators.HUB)) {
    const hubAddr = await getAndCheckAddress(Emulators.HUB, options);
    const hub = new EmulatorHub({ projectId, ...hubAddr });
    await startEmulator(hub);
  }

  // Parse export metadata
  let exportMetadata: ExportMetadata = {
    version: "unknown",
  };
  if (options.import) {
    const importDir = path.resolve(options.import);
    const foundMetadata = findExportMetadata(importDir);
    if (foundMetadata) {
      exportMetadata = foundMetadata;
    } else {
      EmulatorLogger.forEmulator(Emulators.HUB).logLabeled(
        "WARN",
        "emulators",
        `Could not find import/export metadata file, ${clc.bold("skipping data import!")}`
      );
    }
  }

  if (shouldStart(options, Emulators.FUNCTIONS)) {
    const functionsLogger = EmulatorLogger.forEmulator(Emulators.FUNCTIONS);
    const functionsAddr = await getAndCheckAddress(Emulators.FUNCTIONS, options);
    const projectId = getProjectId(options, false);
    const functionsDir = path.join(
      options.extensionDir || options.config.projectDir,
      options.config.get("functions.source")
    );

    let inspectFunctions: number | undefined;
    if (options.inspectFunctions) {
      inspectFunctions = commandUtils.parseInspectionPort(options);

      // TODO(samstern): Add a link to documentation
      functionsLogger.logLabeled(
        "WARN",
        "functions",
        `You are running the functions emulator in debug mode (port=${inspectFunctions}). This means that functions will execute in sequence rather than in parallel.`
      );
    }

    // Warn the developer that the Functions emulator can call out to production.
    const emulatorsNotRunning = ALL_SERVICE_EMULATORS.filter((e) => {
      return e !== Emulators.FUNCTIONS && !shouldStart(options, e);
    });
    if (emulatorsNotRunning.length > 0) {
      functionsLogger.logLabeled(
        "WARN",
        "functions",
        `The following emulators are not running, calls to these services from the Functions emulator will affect production: ${clc.bold(
          emulatorsNotRunning.join(", ")
        )}`
      );
    }

    const functionsEmulator = new FunctionsEmulator({
      projectId,
      functionsDir,
      host: functionsAddr.host,
      port: functionsAddr.port,
      debugPort: inspectFunctions,
      env: {
        ...options.extensionEnv,
      },
      predefinedTriggers: options.extensionTriggers,
      nodeMajorVersion: parseRuntimeVersion(
        options.extensionNodeVersion || options.config.get("functions.runtime")
      ),
    });
    await startEmulator(functionsEmulator);
  }

  if (shouldStart(options, Emulators.FIRESTORE)) {
    const firestoreLogger = EmulatorLogger.forEmulator(Emulators.FIRESTORE);
    const firestoreAddr = await getAndCheckAddress(Emulators.FIRESTORE, options);

    const args: FirestoreEmulatorArgs = {
      host: firestoreAddr.host,
      port: firestoreAddr.port,
      projectId,
      auto_download: true,
    };

    if (exportMetadata.firestore) {
      const importDirAbsPath = path.resolve(options.import);
      const exportMetadataFilePath = path.resolve(
        importDirAbsPath,
        exportMetadata.firestore.metadata_file
      );

      firestoreLogger.logLabeled(
        "BULLET",
        "firestore",
        `Importing data from ${exportMetadataFilePath}`
      );
      args.seed_from_export = exportMetadataFilePath;
    }

    const config = options.config as Config;
    const rulesLocalPath = config.get("firestore.rules");
    let rulesFileFound = false;
    if (rulesLocalPath) {
      const rules: string = config.path(rulesLocalPath);
      rulesFileFound = fs.existsSync(rules);
      if (rulesFileFound) {
        args.rules = rules;
      } else {
        firestoreLogger.logLabeled(
          "WARN",
          "firestore",
          `Cloud Firestore rules file ${clc.bold(rules)} specified in firebase.json does not exist.`
        );
      }
    } else {
      firestoreLogger.logLabeled(
        "WARN",
        "firestore",
        "Did not find a Cloud Firestore rules file specified in a firebase.json config file."
      );
    }

    if (!rulesFileFound) {
      firestoreLogger.logLabeled(
        "WARN",
        "firestore",
        "The emulator will default to allowing all reads and writes. Learn more about this option: https://firebase.google.com/docs/emulator-suite/install_and_configure#security_rules_configuration."
      );
    }

    const firestoreEmulator = new FirestoreEmulator(args);
    await startEmulator(firestoreEmulator);
  }

  if (shouldStart(options, Emulators.DATABASE)) {
    const databaseLogger = EmulatorLogger.forEmulator(Emulators.DATABASE);
    const databaseAddr = await getAndCheckAddress(Emulators.DATABASE, options);

    const args: DatabaseEmulatorArgs = {
      host: databaseAddr.host,
      port: databaseAddr.port,
      projectId,
      auto_download: true,
    };

    const rc = dbRulesConfig.normalizeRulesConfig(
      dbRulesConfig.getRulesConfig(projectId, options),
      options
    );
    logger.debug("database rules config: ", JSON.stringify(rc));

    args.rules = rc;

    if (rc.length === 0) {
      databaseLogger.logLabeled(
        "WARN",
        "database",
        "Did not find a Realtime Database rules file specified in a firebase.json config file. The emulator will default to allowing all reads and writes. Learn more about this option: https://firebase.google.com/docs/emulator-suite/install_and_configure#security_rules_configuration."
      );
    } else {
      for (const c of rc) {
        const rules: string = c.rules;
        if (!fs.existsSync(rules)) {
          databaseLogger.logLabeled(
            "WARN",
            "database",
            `Realtime Database rules file ${clc.bold(
              rules
            )} specified in firebase.json does not exist.`
          );
        }
      }
    }

    const databaseEmulator = new DatabaseEmulator(args);
    await startEmulator(databaseEmulator);

    if (exportMetadata.database) {
      const importDirAbsPath = path.resolve(options.import);
      const databaseExportDir = path.resolve(importDirAbsPath, exportMetadata.database.path);

      const files = fs.readdirSync(databaseExportDir).filter((f) => f.endsWith(".json"));
      for (const f of files) {
        const fPath = path.join(databaseExportDir, f);
        const ns = path.basename(f, ".json");
        await databaseEmulator.importData(ns, fPath);
      }
    }
  }

  if (shouldStart(options, Emulators.AUTH)) {
    if (!projectId) {
      throw new FirebaseError(
        `Cannot start the ${Constants.description(
          Emulators.AUTH
        )} without a project: run 'firebase init' or provide the --project flag`
      );
    }

    const authAddr = await getAndCheckAddress(Emulators.AUTH, options);
    const authEmulator = new AuthEmulator({
      host: authAddr.host,
      port: authAddr.port,
      projectId,
    });
    await startEmulator(authEmulator);
  }

  if (shouldStart(options, Emulators.PUBSUB)) {
    if (!projectId) {
      throw new FirebaseError(
        "Cannot start the Pub/Sub emulator without a project: run 'firebase init' or provide the --project flag"
      );
    }

    const pubsubAddr = await getAndCheckAddress(Emulators.PUBSUB, options);
    const pubsubEmulator = new PubsubEmulator({
      host: pubsubAddr.host,
      port: pubsubAddr.port,
      projectId,
      auto_download: true,
    });
    await startEmulator(pubsubEmulator);
  }

  // Hosting emulator needs to start after all of the others so that we can detect
  // which are running and call useEmulator in __init.js
  if (shouldStart(options, Emulators.HOSTING)) {
    const hostingAddr = await getAndCheckAddress(Emulators.HOSTING, options);
    const hostingEmulator = new HostingEmulator({
      host: hostingAddr.host,
      port: hostingAddr.port,
      options,
    });

    await startEmulator(hostingEmulator);
  }

  if (!noUi && shouldStart(options, Emulators.UI)) {
    const loggingAddr = await getAndCheckAddress(Emulators.LOGGING, options);
    const loggingEmulator = new LoggingEmulator({
      host: loggingAddr.host,
      port: loggingAddr.port,
    });

    await startEmulator(loggingEmulator);

    const uiAddr = await getAndCheckAddress(Emulators.UI, options);
    const ui = new EmulatorUI({
      projectId,
      auto_download: true,
      ...uiAddr,
    });
    await startEmulator(ui);
  }

  const running = EmulatorRegistry.listRunning();
  for (const name of running) {
    const instance = EmulatorRegistry.get(name);
    if (instance) {
      await instance.connect();
    }
  }
}

/**
 * Exports data from emulators that support data export. Used with `emulators:export` and with the --export-on-exit flag.
 * @param exportPath
 * @param options
 */
export async function exportEmulatorData(exportPath: string, options: any) {
  const projectId = options.project;
  if (!projectId) {
    throw new FirebaseError(
      "Could not determine project ID, make sure you're running in a Firebase project directory or add the --project flag.",
      { exit: 1 }
    );
  }

  const hubClient = new EmulatorHubClient(projectId);
  if (!hubClient.foundHub()) {
    throw new FirebaseError(
      `Did not find any running emulators for project ${clc.bold(projectId)}.`,
      { exit: 1 }
    );
  }

  try {
    await hubClient.getStatus();
  } catch (e) {
    const filePath = EmulatorHub.getLocatorFilePath(projectId);
    throw new FirebaseError(
      `The emulator hub for ${projectId} did not respond to a status check. If this error continues try shutting down all running emulators and deleting the file ${filePath}`,
      { exit: 1 }
    );
  }

  utils.logBullet(
    `Found running emulator hub for project ${clc.bold(projectId)} at ${hubClient.origin}`
  );

  // If the export target directory does not exist, we should attempt to create it
  const exportAbsPath = path.resolve(exportPath);
  if (!fs.existsSync(exportAbsPath)) {
    utils.logBullet(`Creating export directory ${exportAbsPath}`);
    fs.mkdirSync(exportAbsPath);
  }

  // Check if there is already an export there and prompt the user about deleting it
  const existingMetadata = HubExport.readMetadata(exportAbsPath);
  if (existingMetadata && !(options.force || options.exportOnExit)) {
    if (options.noninteractive) {
      throw new FirebaseError(
        "Export already exists in the target directory, re-run with --force to overwrite.",
        { exit: 1 }
      );
    }

    const prompt = await promptOnce({
      type: "confirm",
      message: `The directory ${exportAbsPath} already contains export data. Exporting again to the same directory will overwrite all data. Do you want to continue?`,
      default: false,
    });

    if (!prompt) {
      throw new FirebaseError("Command aborted", { exit: 1 });
    }
  }

  // Remove all existing data (metadata.json will be overwritten automatically)
  if (existingMetadata) {
    if (existingMetadata.firestore) {
      const firestorePath = path.join(exportAbsPath, existingMetadata.firestore.path);
      utils.logBullet(`Deleting directory ${firestorePath}`);
      rimraf.sync(firestorePath);
    }
  }

  utils.logBullet(`Exporting data to: ${exportAbsPath}`);
  try {
    await hubClient.postExport(exportAbsPath);
  } catch (e) {
    throw new FirebaseError("Export request failed, see emulator logs for more information.", {
      exit: 1,
      original: e,
    });
  }

  utils.logSuccess("Export complete");
}
