import * as _ from "lodash";
import * as clc from "cli-color";
import * as fs from "fs";
import * as path from "path";
import * as tcpport from "tcp-port-used";
import * as pf from "portfinder";

import * as logger from "../logger";
import * as track from "../track";
import * as utils from "../utils";
import { EmulatorRegistry } from "../emulator/registry";
import {
  Address,
  ALL_SERVICE_EMULATORS,
  EmulatorInstance,
  Emulators,
  EMULATORS_SUPPORTED_BY_UI,
} from "../emulator/types";
import { Constants, FIND_AVAILBLE_PORT_BY_DEFAULT } from "../emulator/constants";
import { FunctionsEmulator } from "../emulator/functionsEmulator";
import { DatabaseEmulator, DatabaseEmulatorArgs } from "../emulator/databaseEmulator";
import { FirestoreEmulator, FirestoreEmulatorArgs } from "../emulator/firestoreEmulator";
import { HostingEmulator } from "../emulator/hostingEmulator";
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
import previews = require("../previews");

export async function checkPortOpen(port: number, host: string): Promise<boolean> {
  try {
    const inUse = await tcpport.check(port, host);
    return !inUse;
  } catch (e) {
    logger.debug(`port check error: ${e}`);
    return false;
  }
}

export async function waitForPortClosed(port: number, host: string): Promise<void> {
  const interval = 250;
  const timeout = 30000;
  try {
    await tcpport.waitUntilUsedOnHost(port, host, interval, timeout);
  } catch (e) {
    throw new FirebaseError(`TIMEOUT: Port ${port} on ${host} was not active within ${timeout}ms`);
  }
}

async function getAndCheckAddress(emulator: Emulators, options: any): Promise<Address> {
  const host = Constants.normalizeHost(
    options.config.get(Constants.getHostKey(emulator), Constants.getDefaultHost(emulator))
  );

  const portVal = options.config.get(Constants.getPortKey(emulator), undefined);
  let port;
  let findAvailablePort = false;
  if (portVal) {
    port = parseInt(portVal, 10);
  } else {
    port = Constants.getDefaultPort(emulator);
    findAvailablePort = FIND_AVAILBLE_PORT_BY_DEFAULT[emulator];
  }

  const logger = EmulatorLogger.forEmulator(emulator);
  const portOpen = await checkPortOpen(port, host);
  if (!portOpen) {
    if (findAvailablePort) {
      const newPort = await pf.getPortPromise({ host, port });
      if (newPort != port) {
        logger.logLabeled(
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
      logger.logLabeled(
        "WARN",
        emulator,
        `Port ${port} is not open on ${host}, could not start ${description}.`
      );
      logger.logLabeled(
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
  return { host, port };
}

export async function startEmulator(instance: EmulatorInstance): Promise<void> {
  const name = instance.getName();

  // Log the command for analytics
  track("emulators:start", name);

  await EmulatorRegistry.start(instance);
}

export async function cleanShutdown(): Promise<void> {
  EmulatorLogger.forEmulator(Emulators.HUB).logLabeled(
    "BULLET",
    "emulators",
    "Shutting down emulators."
  );
  for (const name of EmulatorRegistry.listRunning()) {
    EmulatorLogger.forEmulator(name).logLabeled(
      "BULLET",
      name,
      `Stopping ${Constants.description(name)}`
    );
    await EmulatorRegistry.stop(name);
  }
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
  if (name === Emulators.UI) {
    if (options.config.get("emulators.ui.enabled") === false) {
      // Allow disabling UI via `{emulators: {"ui": {"enabled": false}}}`.
      // Emulator UI is by default enabled if that option is not specified.
      return false;
    }
    // Emulator UI only starts if we know the project ID AND at least one
    // emulator supported by Emulator UI is launching.
    return (
      previews.emulatorgui &&
      !!options.project &&
      targets.some((target) => EMULATORS_SUPPORTED_BY_UI.indexOf(target) >= 0)
    );
  }

  // Don't start the functions emulator if we can't find the source directory
  if (name === Emulators.FUNCTIONS && !options.config.get("functions.source")) {
    EmulatorLogger.forEmulator(Emulators.FUNCTIONS).logLabeled(
      "WARN",
      "functions",
      `The functions emulator is configured but there is no functions source directory. Have you run ${clc.bold(
        "firebase init functions"
      )}?`
    );
    return false;
  }

  if (name === Emulators.HOSTING && !options.config.get("hosting")) {
    EmulatorLogger.forEmulator(Emulators.HOSTING).logLabeled(
      "WARN",
      "hosting",
      `The hosting emulator is configured but there is no hosting configuration. Have you run ${clc.bold(
        "firebase init hosting"
      )}?`
    );
    return false;
  }

  return targets.indexOf(name) >= 0;
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
      EmulatorLogger.forEmulator(name as Emulators).logLabeled(
        "WARN",
        name,
        `Not starting the ${clc.bold(name)} emulator, make sure you have run ${clc.bold(
          "firebase init"
        )}.`
      );
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
    exportMetadata = JSON.parse(
      fs.readFileSync(path.join(importDir, HubExport.METADATA_FILE_NAME), "utf8").toString()
    ) as ExportMetadata;
  }

  if (shouldStart(options, Emulators.FUNCTIONS)) {
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
      EmulatorLogger.forEmulator(Emulators.FUNCTIONS).logLabeled(
        "WARN",
        "functions",
        `You are running the functions emulator in debug mode (port=${inspectFunctions}). This means that functions will execute in sequence rather than in parallel.`
      );
    }

    const functionsEmulator = new FunctionsEmulator({
      projectId,
      functionsDir,
      host: functionsAddr.host,
      port: functionsAddr.port,
      debugPort: inspectFunctions,
      env: options.extensionEnv,
      predefinedTriggers: options.extensionTriggers,
      nodeMajorVersion: options.extensionNodeVersion,
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
      const exportMetadataFilePath = path.join(
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

    const rulesLocalPath = options.config.get("firestore.rules");
    let rulesFileFound = false;
    if (rulesLocalPath) {
      const rules: string = path.join(options.projectRoot, rulesLocalPath);
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

    const rc = dbRulesConfig.getRulesConfig(projectId, options);
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
        const rules: string = path.join(options.projectRoot, c.rules);
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
  }

  if (shouldStart(options, Emulators.HOSTING)) {
    const hostingAddr = await getAndCheckAddress(Emulators.HOSTING, options);
    const hostingEmulator = new HostingEmulator({
      host: hostingAddr.host,
      port: hostingAddr.port,
      options,
    });

    await startEmulator(hostingEmulator);
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
