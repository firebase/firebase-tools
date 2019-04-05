"use strict";

import * as _ from "lodash";
import * as url from "url";

import * as Command from "../command";
import * as logger from "../logger";
import * as javaEmulator from "../serve/javaEmulators";
import * as filterTargets from "../filterTargets";

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
      const { host, port } = parseAddress(addressStr);

      logger.debug(`Starting firestore emulator at ${host}:${port}`);

      // TODO(samstern): Use the host somehow
      await javaEmulator.start("firestore", port);
    }

    if (targets.indexOf("functions") >= 0) {
      // TODO(rpb): start the functions emulator
    }

    if (targets.indexOf("database") >= 0) {
      // TODO(rpb): start the database emulator
    }
  });
