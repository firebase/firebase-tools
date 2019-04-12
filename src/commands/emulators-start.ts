"use strict";

import * as clc from "cli-color";
import * as pf from "portfinder";

import getProjectNumber = require("../getProjectNumber");
import * as Command from "../command";
import * as utils from "../utils";
import * as track from "../track";
import requireAuth = require("../requireAuth");
import requireConfig = require("../requireConfig");
import * as filterTargets from "../filterTargets";
import { EmulatorRegistry } from "../emulator/registry";
import { Address, EmulatorInfo, EmulatorInstance, Emulators } from "../emulator/types";
import { Constants } from "../emulator/constants";
import { FunctionsEmulator } from "../functionsEmulator";
import { DatabaseEmulator } from "../emulator/databaseEmulator";
import { FirestoreEmulator } from "../emulator/firestoreEmulator";

// TODO: This should come from the enum
const VALID_EMULATORS = ["database", "firestore", "functions", "hosting"];

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

  return new Promise(async (res, rej) => {
    let elapsed = 0;
    const intId = setInterval(async () => {
      const open = await checkPortOpen(port);
      if (!open) {
        // If the port is NOT open that means the emulator is running
        clearInterval(intId);
        res();
        return;
      }

      // After a timeout, stop waiting for the emulator.
      elapsed += interval;
      if (elapsed > timeout) {
        clearInterval(intId);

        // TODO(samstern): This should be FirebaseError
        rej(`TIMEOUT: Port ${port} was not active within ${timeout}ms`);
      }
    }, interval);
  });
}

async function startEmulator(
  name: Emulators,
  addr: Address,
  instance: EmulatorInstance
): Promise<void> {
  // Log the command for analytics
  track("emulators:start", name);

  const portOpen = await checkPortOpen(addr.port);
  if (!portOpen) {
    utils.logWarning(`Port ${addr.port} is not open, could not start ${name} emulator.`);
    utils.logBullet(`To select a different port for the emulator, update your "firebase.json":
    {
      // ...
      "emulators": {
        "${name}": {
          "address": "localhost:${clc.yellow("PORT")}"
        }
      }
    }`);

    await cleanShutdown();
    return utils.reject(`Could not start ${name} emulator, port taken.`, {});
  }

  utils.logLabeledBullet(name, `Starting emulator at ${addr.host}:${addr.port}`);

  // Start the emulator, wait for it to grab its port, and then mark it as started
  // in the registry.
  await instance.start();
  await waitForPortClosed(addr.port);

  const info: EmulatorInfo = {
    host: addr.host,
    port: addr.port,
    instance,
  };
  EmulatorRegistry.setInfo(name, info);

  utils.logLabeledSuccess(name, "Emulator running.");
}

function stopEmulator(name: Emulators): Promise<any> {
  if (!EmulatorRegistry.isRunning(name)) {
    return Promise.resolve();
  }

  const instance = EmulatorRegistry.getInstance(name);
  if (!instance) {
    return Promise.resolve();
  }

  return instance.stop();
}

async function cleanShutdown(): Promise<boolean> {
  utils.logBullet("Shutting down emulators.");

  for (const name of EmulatorRegistry.listRunning()) {
    utils.logBullet(`Stopping ${name} emulator`);
    await stopEmulator(name);
    EmulatorRegistry.clearInfo(name);
  }

  return true;
}

async function startAll(options: any): Promise<void> {
  // Emulators config is specified in firebase.json as:
  // "emulators": {
  //   "firestore": {
  //     "address": "localhost:9005"
  //   },
  //   // ...
  // }
  //
  // The list of emulators to start is filtered two ways:
  // 1) The service must have a top-level entry in firebase.json
  // 2) If the --only flag is passed, then this list is the intersection
  //
  // Emulators must be started in this order:
  // 1) Firestore / Database --> no dependencies
  // 2) Functions --> must be started after any emulators which expose triggers
  // 3) Hosting --> must be started after Functions to enable redirects
  const targets: string[] = filterTargets(options, VALID_EMULATORS);
  utils.logBullet(`Starting emulators: ${JSON.stringify(targets)}`);

  if (targets.includes("firestore")) {
    const firestoreAddr = Constants.getAddress(Emulators.FIRESTORE, options);
    await startEmulator(
      Emulators.FIRESTORE,
      firestoreAddr,
      new FirestoreEmulator({
        host: firestoreAddr.host,
        port: firestoreAddr.port,
      })
    );
  }

  if (targets.includes("database")) {
    const databaseAddr = Constants.getAddress(Emulators.DATABASE, options);
    await startEmulator(
      Emulators.DATABASE,
      databaseAddr,
      new DatabaseEmulator({
        host: databaseAddr.host,
        port: databaseAddr.port,
      })
    );

    // TODO: When the database emulator is integrated with the Functions
    //       emulator, we will need to pass the port in and remove this warning
    utils.logWarning(
      `Note: the database emulator is not currently integrated with the functions emulator.`
    );
  }

  if (targets.includes("functions")) {
    const functionsAddr = Constants.getAddress(Emulators.FUNCTIONS, options);
    await startEmulator(
      Emulators.FUNCTIONS,
      functionsAddr,
      new FunctionsEmulator(options, {
        host: functionsAddr.host,
        port: functionsAddr.port,
      })
    );
  }

  if (targets.includes("hosting")) {
    const hostingAddr = Constants.getAddress(Emulators.HOSTING, options);
    // TODO: Start hosting
    utils.logWarning("Hosting emulator not currently implemented.");
  }
}

module.exports = new Command("emulators:start")
  .before(async (options: any) => {
    await requireConfig(options);
    await requireAuth(options);
    await getProjectNumber(options);
  })
  .description("start the local Firebase emulators")
  .option(
    "--only <list>",
    "only run specific emulators. " +
      "This is a comma separated list of emulators to start. " +
      "Valid options are: " +
      JSON.stringify(VALID_EMULATORS)
  )
  .action(async (options: any) => {
    try {
      await startAll(options);
    } catch (e) {
      await cleanShutdown();
      throw e;
    }

    // Hang until explicitly killed
    await new Promise((res, rej) => {
      process.on("SIGINT", () => {
        cleanShutdown()
          .then(res)
          .catch(res);
      });
    });
  });
