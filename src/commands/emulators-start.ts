"use strict";

import * as _ from "lodash";
import * as clc from "cli-color";
import * as pf from "portfinder";
import * as url from "url";

import * as Command from "../command";
import * as javaEmulator from "../serve/javaEmulators";
import * as filterTargets from "../filterTargets";
import * as utils from "../utils";
import * as track from "../track";

import requireAuth = require("../requireAuth");
import { EmulatorRegistry } from "../emulator/registry";
import { EmulatorInfo, Emulators, EmulatorInstance } from "../emulator/types";
import { Constants } from "../emulator/constants";
import { FunctionsEmulator } from "../functionsEmulator";
import { DatabaseEmulator } from "../emulator/databaseEmulator";
import { database } from "firebase-admin";
import { FirestoreEmulator } from "../emulator/firestoreEmulator";

// TODO: This should come from the enum
const VALID_EMULATORS = ["database", "firestore", "functions"];

interface Address {
  host: string;
  port: number;
}

function parseAddress(address: string): Address {
  let normalized = address;
  if (!normalized.startsWith("http")) {
    normalized = `http://${normalized}`;
  }

  const u = url.parse(normalized);
  const host = u.hostname || "localhost";
  const portStr = u.port || "-1";
  const port = parseInt(portStr, 10);

  return { host, port };
}

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

async function cleanShutdown() {
  utils.logBullet("Shutting down emulators.");

  for (const name of EmulatorRegistry.listRunning()) {
    utils.logBullet(`Stopping ${name} emulator`);
    await stopEmulator(name);
    EmulatorRegistry.clearInfo(name);
  }

  return true;
}

module.exports = new Command("emulators:start")
  .before(requireAuth)
  .description("start the local Firebase emulators")
  .option(
    "--only <list>",
    "only run specific emulators. " +
      "This is a comma separated list of emulators to start. " +
      "Valid options are: " +
      JSON.stringify(VALID_EMULATORS)
  )
  .action(async (options: any) => {
    // Emulators config is specified in firebase.json as:
    // "emulators": {
    //   "firestore": {
    //     "address": "localhost:9005"
    //   },
    //   // ...
    // }
    // The list of emulators to start is filtered two ways:
    // 1) The service must have a top-level entry in firebase.json
    // 2) If the --only flag is passed, then this list is the intersection
    const targets: string[] = filterTargets(options, VALID_EMULATORS);
    utils.logBullet(`Starting emulators: ${JSON.stringify(targets)}`);

    const functionsAddr = parseAddress(
      options.config.get(
        "emulators.functions.address",
        `localhost:${Constants.getDefaultPort(Emulators.FUNCTIONS)}`
      )
    );
    const firestoreAddr = parseAddress(
      options.config.get(
        "emulators.firestore.address",
        `localhost:${Constants.getDefaultPort(Emulators.FIRESTORE)}`
      )
    );
    const databaseAddr = parseAddress(
      options.config.get(
        "emulators.database.address",
        `localhost:${Constants.getDefaultPort(Emulators.DATABASE)}`
      )
    );

    if (targets.indexOf("firestore") >= 0) {
      await startEmulator(
        Emulators.FIRESTORE,
        firestoreAddr,
        new FirestoreEmulator({
          host: firestoreAddr.host,
          port: firestoreAddr.port,
          functions_emulator: `${functionsAddr.host}:${functionsAddr.port}`,
        })
      );
    }

    if (targets.indexOf("database") >= 0) {
      await startEmulator(
        Emulators.DATABASE,
        databaseAddr,
        new DatabaseEmulator({ host: databaseAddr.host, port: databaseAddr.port })
      );

      // TODO: When the database emulator is integrated with the Functions
      //       emulator, we will need to pass the port in and remove this warning
      utils.logWarning(
        `Note: the database emulator is not currently integrated with the functions emulator.`
      );
    }

    // The Functions emulator MUST be started last so that triggers can be
    // set up correctly.
    if (targets.indexOf("functions") >= 0) {
      // TODO: Should not have to pass in the Firestore port, it should be
      //       fetched from the registry.
      await startEmulator(
        Emulators.FUNCTIONS,
        functionsAddr,
        new FunctionsEmulator(options, {
          port: functionsAddr.port,
          firestorePort: firestoreAddr.port,
        })
      );
    }

    // Hang until explicitly killed
    return new Promise((res, rej) => {
      process.on("SIGINT", () => {
        cleanShutdown()
          .then(res)
          .catch(res);
      });
    });
  });
