import * as _ from "lodash";
import * as clc from "cli-color";
import * as fs from "fs";
import * as pf from "portfinder";

import * as utils from "../utils";
import * as track from "../track";
import * as filterTargets from "../filterTargets";
import { EmulatorRegistry } from "../emulator/registry";
import { ALL_EMULATORS, EmulatorInstance, Emulators } from "../emulator/types";
import { Constants } from "../emulator/constants";
import { FunctionsEmulator } from "../emulator/functionsEmulator";
import { DatabaseEmulator } from "../emulator/databaseEmulator";
import { FirestoreEmulator, FirestoreEmulatorArgs } from "../emulator/firestoreEmulator";
import { HostingEmulator } from "../emulator/hostingEmulator";
import * as FirebaseError from "../error";
import * as path from "path";

export const VALID_EMULATOR_STRINGS: string[] = ALL_EMULATORS;

async function checkPortOpen(port: number): Promise<boolean> {
  try {
    await pf.getPortPromise({ port, stopPort: port });
    return true;
  } catch (e) {
    return false;
  }
}

async function waitForPortClosed(port: number): Promise<void> {
  const interval = 250;
  const timeout = 30000;

  let elapsed = 0;
  while (elapsed < timeout) {
    const open = await checkPortOpen(port);
    if (!open) {
      return;
    }
    await new Promise((r) => setTimeout(r, interval));
    elapsed += interval;
  }
  throw new FirebaseError(`TIMEOUT: Port ${port} was not active within ${timeout}ms`);
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

  // Start the emulator, wait for it to grab its port, and then mark it as started
  // in the registry.
  await EmulatorRegistry.start(instance);
  await waitForPortClosed(info.port);
}

export async function cleanShutdown(): Promise<boolean> {
  utils.logBullet("Shutting down emulators.");

  for (const name of EmulatorRegistry.listRunning()) {
    utils.logBullet(`Stopping ${name} emulator`);
    await EmulatorRegistry.stop(name);
  }

  return true;
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

  if (targets.indexOf(Emulators.FUNCTIONS) > -1) {
    const functionsAddr = Constants.getAddress(Emulators.FUNCTIONS, options);
    const functionsEmulator = new FunctionsEmulator(options, {
      host: functionsAddr.host,
      port: functionsAddr.port,
    });
    await startEmulator(functionsEmulator);
  }

  if (targets.indexOf(Emulators.FIRESTORE) > -1) {
    const firestoreAddr = Constants.getAddress(Emulators.FIRESTORE, options);

    const args: FirestoreEmulatorArgs = {
      host: firestoreAddr.host,
      port: firestoreAddr.port,
    };

    const rules: string = path.join(options.projectRoot, options.config.get("firestore.rules"));
    if (fs.existsSync(rules)) {
      args.rules = rules;
    } else {
      utils.logWarning(
        `Firestore rules file ${clc.bold(
          rules
        )} specified in firebase.json does not exist, starting Firestore emulator without rules.`
      );
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

  if (targets.indexOf(Emulators.DATABASE) > -1) {
    const databaseAddr = Constants.getAddress(Emulators.DATABASE, options);
    let databaseEmulator;
    if (targets.indexOf(Emulators.FUNCTIONS) > -1) {
      const functionsAddr = Constants.getAddress(Emulators.FUNCTIONS, options);
      databaseEmulator = new DatabaseEmulator({
        host: databaseAddr.host,
        port: databaseAddr.port,
        functions_emulator_host: functionsAddr.host,
        functions_emulator_port: functionsAddr.port,
      });
    } else {
      databaseEmulator = new DatabaseEmulator({
        host: databaseAddr.host,
        port: databaseAddr.port,
      });
    }
    await startEmulator(databaseEmulator);
  }

  if (targets.indexOf(Emulators.HOSTING) > -1) {
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
