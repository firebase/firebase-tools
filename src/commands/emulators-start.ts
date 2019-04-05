"use strict";

import * as _ from "lodash";

import * as Command from "../command";
import * as logger from "../logger";
import * as javaEmulator from "../serve/javaEmulators";
import * as filterTargets from "../filterTargets";

const VALID_EMULATORS = ["database", "firestore", "functions"];

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
      logger.debug("Starting firestore emulator...");
      await javaEmulator.start("firestore");
    }

    if (targets.indexOf("functions") >= 0) {
      logger.debug("Starting functions emulator...");
      // TODO(rpb): start the functions emulator
    }

    if (targets.indexOf("database") >= 0) {
      logger.debug("Starting database emulator...");
      // TODO(rpb): start the database emulator
    }
  });
