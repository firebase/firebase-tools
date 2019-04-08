"use strict";

import * as _ from "lodash";
import * as url from "url";

import * as Command from "../command";
import * as logger from "../logger";
import * as javaEmulator from "../serve/javaEmulators";
import * as filterTargets from "../filterTargets";
import * as utils from "../utils";

import * as pf from "portfinder";

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
  const portStr = u.port || "8080";
  const port = parseInt(portStr);

  return { host, port };
}

async function checkPortOpen(port: number) {
  try {
    await pf.getPortPromise({ port: port, stopPort: port });
    return true;
  } catch (e) {
    return false;
  }
}

async function waitForPortClosed(port: number) {
  const interval = 250;
  const timeout = 30000;

  return new Promise(async (res, rej) => {
    let elapsed = 0;
    const intId = setInterval(async function() {
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

async function startEmulator(name: string, addr: Address, startFn: () => Promise<any>) {
  const portOpen = await checkPortOpen(addr.port);
  if (!portOpen) {
    return utils.reject(`Port ${addr.port} is not open, could not start ${name} emulator.`, {});
  }

  utils.logBullet(`Starting ${name} emulator at ${addr.host}:${addr.port}`);
  await startFn();
  await waitForPortClosed(addr.port);
  utils.logSuccess(`${name} emulator running.`);
}

module.exports = new Command("emulators:start")
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

    // TODO(samstern): Decide on emulator default addresses
    const functionsAddr = parseAddress(
      options.config.get("emulators.functions.address", "localhost:8080")
    );
    const firestoreAddr = parseAddress(
      options.config.get("emulators.firestore.address", "localhost:8081")
    );
    const rtdbAddr = parseAddress(
      options.config.get("emulators.functions.address", "localhost:8082")
    );

    // The Functions emulator MUST be started first so that triggers can be
    // set up correctly.
    if (targets.indexOf("functions") >= 0) {
      await startEmulator("functions", functionsAddr, () => {
        // TODO: Don't start the firestore emulator twice, actually start functions
        return javaEmulator.start("firestore", functionsAddr.port);
      });
    }

    if (targets.indexOf("firestore") >= 0) {
      await startEmulator("firestore", firestoreAddr, () => {
        // TODO: Pass in the address of the functions emulator
        return javaEmulator.start("firestore", firestoreAddr.port);
      });
    }

    if (targets.indexOf("database") >= 0) {
      // TODO(rpb): start the database emulator
    }
  });
