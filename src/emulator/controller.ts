import * as _ from "lodash";
import * as clc from "cli-color";
import * as fs from "fs";
import * as path from "path";
import * as tcpport from "tcp-port-used";
import * as pf from "portfinder";

import * as logger from "../logger";
import * as utils from "../utils";
import * as track from "../track";
import { EmulatorRegistry } from "../emulator/registry";
import {
  ALL_SERVICE_EMULATORS,
  EmulatorInstance,
  Emulators,
  EMULATORS_SUPPORTED_BY_GUI,
} from "../emulator/types";
import { Constants } from "../emulator/constants";
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
import { EmulatorGUI } from "./gui";
import { LoggingEmulator } from "./loggingEmulator";
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

export async function startEmulator(instance: EmulatorInstance): Promise<void> {
  const name = instance.getName();
  const { host, port } = instance.getInfo();

  // Log the command for analytics
  track("emulators:start", name);

  const portOpen = await checkPortOpen(port, host);
  if (!portOpen) {
    await cleanShutdown();
    const description = Constants.description(name);
    utils.logLabeledWarning(
      name,
      `Port ${port} is not open on ${host}, could not start ${description}.`
    );
    utils.logLabeledBullet(
      name,
      `To select a different host/port for the emulator, specify that host/port in a firebase.json config file:
    {
      // ...
      "emulators": {
        "${name}": {
          "host": "${clc.yellow("HOST")}",
          "port": "${clc.yellow("PORT")}"
        }
      }
    }`
    );
    return utils.reject(`Could not start ${name} emulator, port taken.`, {});
  }

  await EmulatorRegistry.start(instance);
}

export async function cleanShutdown(): Promise<boolean> {
  utils.logLabeledBullet("emulators", "Shutting down emulators.");

  for (const name of EmulatorRegistry.listRunning()) {
    utils.logLabeledBullet(name, `Stopping ${Constants.description(name)}`);
    await EmulatorRegistry.stop(name);
  }

  return true;
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
  if (name === Emulators.GUI) {
    // The GUI only starts if we know the project ID AND at least one emulator
    // supported by GUI is launching.
    return (
      previews.emulatorgui &&
      !!options.project &&
      targets.some((target) => EMULATORS_SUPPORTED_BY_GUI.indexOf(target) >= 0)
    );
  }

  return targets.indexOf(name) >= 0;
}

export async function startAll(options: any, noGui: boolean = false): Promise<void> {
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

  utils.logLabeledBullet("emulators", `Starting emulators: ${targets.join(", ")}`);
  if (options.only) {
    const requested: string[] = options.only.split(",");
    const ignored = _.difference(requested, targets);

    for (const name of ignored) {
      utils.logLabeledWarning(
        name,
        `Not starting the ${clc.bold(name)} emulator, make sure you have run ${clc.bold(
          "firebase init"
        )}.`
      );
    }
  }

  if (shouldStart(options, Emulators.HUB)) {
    // For the hub we actually will find any available port
    // since we don't want to explode if the hub can't start on 4000
    const hubAddr = Constants.getAddress(Emulators.HUB, options);
    const hubPort = await pf.getPortPromise({
      host: hubAddr.host,
      port: hubAddr.port,
      stopPort: hubAddr.port + 100,
    });

    if (hubPort != hubAddr.port) {
      utils.logLabeledWarning(
        "emulators",
        `${Constants.description(Emulators.HUB)} unable to start on port ${
          hubAddr.port
        }, starting on ${hubPort}`
      );
    }

    const hub = new EmulatorHub({
      projectId,
      host: hubAddr.host,
      port: hubPort,
    });
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
    const functionsAddr = Constants.getAddress(Emulators.FUNCTIONS, options);

    const projectId = getProjectId(options, false);
    const functionsDir = path.join(
      options.extensionDir || options.config.projectDir,
      options.config.get("functions.source")
    );

    let inspectFunctions: number | undefined;
    if (options.inspectFunctions) {
      inspectFunctions = commandUtils.parseInspectionPort(options);

      // TODO(samstern): Add a link to documentation
      utils.logLabeledWarning(
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
    });
    await startEmulator(functionsEmulator);
  }

  if (shouldStart(options, Emulators.FIRESTORE)) {
    const firestoreAddr = Constants.getAddress(Emulators.FIRESTORE, options);

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

      utils.logLabeledBullet("firestore", `Importing data from ${exportMetadataFilePath}`);
      args.seed_from_export = exportMetadataFilePath;
    }

    const rulesLocalPath = options.config.get("firestore.rules");
    const foundRulesFile = rulesLocalPath && fs.existsSync(rulesLocalPath);
    if (rulesLocalPath) {
      const rules: string = path.join(options.projectRoot, rulesLocalPath);
      if (fs.existsSync(rules)) {
        args.rules = rules;
      } else {
        utils.logLabeledWarning(
          "firestore",
          `Cloud Firestore rules file ${clc.bold(rules)} specified in firebase.json does not exist.`
        );
      }
    } else {
      utils.logLabeledWarning(
        "firestore",
        "Did not find a Cloud Firestore rules file specified in a firebase.json config file."
      );
    }

    if (!foundRulesFile) {
      utils.logLabeledWarning(
        "firestore",
        "The emulator will default to allowing all reads and writes. Learn more about this option: https://firebase.google.com/docs/emulator-suite/install_and_configure#security_rules_configuration."
      );
    }

    const firestoreEmulator = new FirestoreEmulator(args);
    await startEmulator(firestoreEmulator);

    utils.logLabeledBullet(
      Emulators.FIRESTORE,
      `For testing set ${clc.bold(
        `${Constants.FIRESTORE_EMULATOR_HOST}=${firestoreAddr.host}:${firestoreAddr.port}`
      )}`
    );
  }

  if (shouldStart(options, Emulators.DATABASE)) {
    const databaseAddr = Constants.getAddress(Emulators.DATABASE, options);

    const args: DatabaseEmulatorArgs = {
      host: databaseAddr.host,
      port: databaseAddr.port,
      projectId,
      auto_download: true,
    };

    if (shouldStart(options, Emulators.FUNCTIONS)) {
      const functionsAddr = Constants.getAddress(Emulators.FUNCTIONS, options);
      args.functions_emulator_host = functionsAddr.host;
      args.functions_emulator_port = functionsAddr.port;
    }

    const rulesLocalPath = options.config.get("database.rules");
    const foundRulesFile = rulesLocalPath && fs.existsSync(rulesLocalPath);
    if (rulesLocalPath) {
      const rules: string = path.join(options.projectRoot, rulesLocalPath);
      if (fs.existsSync(rules)) {
        args.rules = rules;
      } else {
        utils.logLabeledWarning(
          "database",
          `Realtime Database rules file ${clc.bold(
            rules
          )} specified in firebase.json does not exist.`
        );
      }
    } else {
      utils.logLabeledWarning(
        "database",
        "Did not find a Realtime Database rules file specified in a firebase.json config file."
      );
    }

    if (!foundRulesFile) {
      utils.logLabeledWarning(
        "database",
        "The emulator will default to allowing all reads and writes. Learn more about this option: https://firebase.google.com/docs/emulator-suite/install_and_configure#security_rules_configuration."
      );
    }

    const databaseEmulator = new DatabaseEmulator(args);
    await startEmulator(databaseEmulator);

    utils.logLabeledBullet(
      Emulators.DATABASE,
      `For testing set ${clc.bold(
        `${Constants.FIREBASE_DATABASE_EMULATOR_HOST}=${databaseAddr.host}:${databaseAddr.port}`
      )}`
    );
  }

  if (shouldStart(options, Emulators.HOSTING)) {
    const hostingAddr = Constants.getAddress(Emulators.HOSTING, options);
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

    const pubsubAddr = Constants.getAddress(Emulators.PUBSUB, options);
    const pubsubEmulator = new PubsubEmulator({
      host: pubsubAddr.host,
      port: pubsubAddr.port,
      projectId,
      auto_download: true,
    });
    await startEmulator(pubsubEmulator);
  }

  if (!noGui && shouldStart(options, Emulators.GUI)) {
    const loggingAddr = Constants.getAddress(Emulators.LOGGING, options);
    const loggingEmulator = new LoggingEmulator({
      host: loggingAddr.host,
      port: loggingAddr.port,
    });

    await startEmulator(loggingEmulator);

    // For the GUI we actually will find any available port
    // since we don't want to explode if the GUI can't start on 3000.
    const guiAddr = Constants.getAddress(Emulators.GUI, options);
    const guiPort = await pf.getPortPromise({
      host: guiAddr.host,
      port: guiAddr.port,
      stopPort: guiAddr.port + 100,
    });

    if (guiPort != guiAddr.port) {
      utils.logLabeledWarning(
        Emulators.GUI,
        `${Constants.description(Emulators.GUI)} unable to start on port ${
          guiAddr.port
        }, starting on ${guiPort}`
      );
    }

    const gui = new EmulatorGUI({
      projectId,
      host: guiAddr.host,
      port: guiPort,
      auto_download: true,
    });
    await startEmulator(gui);
  }

  const running = EmulatorRegistry.listRunning();
  for (const name of running) {
    const instance = EmulatorRegistry.get(name);
    if (instance) {
      await instance.connect();
    }
  }
}
