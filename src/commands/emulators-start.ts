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
  return new Promise(async (res, rej) => {
    const intId = setInterval(async function() {
      const open = await checkPortOpen(port);
      if (!open) {
        // If the port is NOT open that means the emulator is running
        clearInterval(intId);
        res();
      }
    }, 250);
  });
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
    const emulatorsConfig = options.config.get("emulators");
    logger.debug("Emulators config: " + JSON.stringify(emulatorsConfig));

    // The list of emulators to start is filtered two ways:
    // 1) The service must have a top-level entry in firebase.json
    // 2) If the --only flag is passed, then this list is the intersection
    const targets: string[] = filterTargets(options, VALID_EMULATORS);

    // TODO(samstern): Parse address options and pass ports to the emulators

    if (targets.indexOf("firestore") >= 0) {
      const addressStr = options.config.get("emulators.firestore.address", "localhost:8080");
      const addr = parseAddress(addressStr);

      utils.logBullet(`Starting firestore emulator at ${addr.host}:${addr.port}`);
      const portOpen = await checkPortOpen(addr.port);
      if (!portOpen) {
        return utils.reject(`Port ${addr.port} is not open, could not start emulator.`, {});
      }
      await javaEmulator.start("firestore", addr.port);
      await waitForPortClosed(addr.port);
      utils.logSuccess(`Firestore emulator running.`);
    }

    if (targets.indexOf("functions") >= 0) {
      // TODO(rpb): start the functions emulator
    }

    if (targets.indexOf("database") >= 0) {
      // TODO(rpb): start the database emulator
    }
  });
