import * as _ from "lodash";
import * as clc from "cli-color";
import * as fs from "fs";
import * as path from "path";
import * as tcpport from "tcp-port-used";

import * as utils from "../utils";
import * as track from "../track";
import * as filterTargets from "../filterTargets";
import { EmulatorRegistry } from "../emulator/registry";
import { ALL_EMULATORS, EmulatorInstance, Emulators } from "../emulator/types";
import { Constants } from "../emulator/constants";
import { FunctionsEmulator } from "../emulator/functionsEmulator";
import { DatabaseEmulator, DatabaseEmulatorArgs } from "../emulator/databaseEmulator";
import { FirestoreEmulator, FirestoreEmulatorArgs } from "../emulator/firestoreEmulator";
import { HostingEmulator } from "../emulator/hostingEmulator";
import { FirebaseError } from "../error";
import * as getProjectId from "../getProjectId";

export const VALID_EMULATOR_STRINGS: string[] = ALL_EMULATORS;

export async function checkPortOpen(port: number): Promise<boolean> {
  try {
    const inUse = await tcpport.check(port);
    return !inUse;
  } catch (e) {
    return false;
  }
}

export async function waitForPortClosed(port: number): Promise<void> {
  const interval = 250;
  const timeout = 30000;
  try {
    await tcpport.waitUntilUsed(port, interval, timeout);
  } catch (e) {
    throw new FirebaseError(`TIMEOUT: Port ${port} was not active within ${timeout}ms`);
  }
}

export async function startEmulator(instance: EmulatorInstance): Promise<void> {
  const name = instance.getName();
  const info = instance.getInfo();

  // Log the command for analytics
  track("emulators:start", name);

  // TODO(samstern): This check should only occur when the host is localhost
  const portOpen = await checkPortOpen(info.port);
  if (!portOpen) {
    await cleanShutdown();
    utils.logWarning(`Port ${info.port} is not open, could not start ${name} emulator.`);
    utils.logBullet(`To select a different port for the emulator, update your "firebase.json":
    {
      // ...
      "emulators": {
        "${name}": {
          "port": "${clc.yellow("PORT")}"
        }
      }
    }`);
    return utils.reject(`Could not start ${name} emulator, port taken.`, {});
  }

  await EmulatorRegistry.start(instance);
}

export async function cleanShutdown(): Promise<boolean> {
  utils.logBullet("Shutting down emulators.");

  for (const name of EmulatorRegistry.listRunning()) {
    utils.logBullet(`Stopping ${name} emulator`);
    await EmulatorRegistry.stop(name);
  }

  return true;
}

export function shouldStart(options: any, name: Emulators): boolean {
  const targets: string[] = filterTargets(options, VALID_EMULATOR_STRINGS);
  return targets.indexOf(name) >= 0;
}

export async function startAll(options: any): Promise<void> {
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
  // 1) The service must have a top-level entry in firebase.json
  // 2) If the --only flag is passed, then this list is the intersection
  const targets: string[] = filterTargets(options, VALID_EMULATOR_STRINGS);
  options.targets = targets;

  const projectId: string | undefined = getProjectId(options, true);

  utils.logBullet(`Starting emulators: ${JSON.stringify(targets)}`);
  if (options.only) {
    const requested: string[] = options.only.split(",");
    const ignored: string[] = _.difference(requested, targets);
    for (const name of ignored) {
      utils.logWarning(
        `Not starting the ${clc.bold(name)} emulator, make sure you have run ${clc.bold(
          "firebase init"
        )}.`
      );
    }
  }

  if (shouldStart(options, Emulators.FUNCTIONS)) {
    const functionsAddr = Constants.getAddress(Emulators.FUNCTIONS, options);

    const projectId = getProjectId(options, false);
    const functionsDir = path.join(
      options.config.projectDir,
      options.config.get("functions.source")
    );

    const functionsEmulator = new FunctionsEmulator({
      projectId,
      functionsDir,
      host: functionsAddr.host,
      port: functionsAddr.port,
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

    const rulesLocalPath = options.config.get("firestore.rules");
    if (rulesLocalPath) {
      const rules: string = path.join(options.projectRoot, rulesLocalPath);
      if (fs.existsSync(rules)) {
        args.rules = rules;
      } else {
        utils.logWarning(
          `Firestore rules file ${clc.bold(
            rules
          )} specified in firebase.json does not exist, starting Firestore emulator without rules.`
        );
      }
    } else {
      utils.logWarning(`No Firestore rules file specified in firebase.json, using default rules.`);
    }

    const firestoreEmulator = new FirestoreEmulator(args);
    await startEmulator(firestoreEmulator);

    utils.logLabeledBullet(
      Emulators.FIRESTORE,
      `For testing set ${clc.bold(
        `${FirestoreEmulator.FIRESTORE_EMULATOR_ENV}=${firestoreAddr.host}:${firestoreAddr.port}`
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
    if (rulesLocalPath) {
      const rules: string = path.join(options.projectRoot, rulesLocalPath);
      if (fs.existsSync(rules)) {
        args.rules = rules;
      } else {
        utils.logWarning(
          `Database rules file ${clc.bold(
            rules
          )} specified in firebase.json does not exist, starting Database emulator without rules.`
        );
      }
    } else {
      utils.logWarning(`No Database rules file specified in firebase.json, using default rules.`);
    }

    const databaseEmulator = new DatabaseEmulator(args);
    await startEmulator(databaseEmulator);

    utils.logLabeledBullet(
      Emulators.DATABASE,
      `For testing set ${clc.bold(
        `${DatabaseEmulator.DATABASE_EMULATOR_ENV}=${databaseAddr.host}:${databaseAddr.port}`
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

  const running = EmulatorRegistry.listRunning();
  for (const name of running) {
    const instance = EmulatorRegistry.get(name);
    if (instance) {
      await instance.connect();
    }
  }
}
