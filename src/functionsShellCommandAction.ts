/**
 * Copyright (c) 2022 Google LLC
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of
 * this software and associated documentation files (the "Software"), to deal in
 * the Software without restriction, including without limitation the rights to
 * use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
 * the Software, and to permit persons to whom the Software is furnished to do so,
 * subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
 * FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
 * COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
 * IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
 * CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

/* eslint-disable @typescript-eslint/ban-ts-comment */
import * as clc from "cli-color";
import * as repl from "repl";
import * as _ from "lodash";
import * as request from "request";
import * as util from "util";

import { FunctionsServer } from "./serve/functions";
import * as LocalFunction from "./localFunction";
import * as utils from "./utils";
import { logger } from "./logger";
import * as shell from "./emulator/functionsEmulatorShell";
import * as commandUtils from "./emulator/commandUtils";
import { EMULATORS_SUPPORTED_BY_FUNCTIONS, EmulatorInfo, Emulators } from "./emulator/types";
import { EmulatorHubClient } from "./emulator/hubClient";
import { findAvailablePort } from "./emulator/portUtils";
import { Options } from "./options";

const serveFunctions = new FunctionsServer();

export const actionFunction = async (options: Options) => {
  if (typeof options.port === "string") {
    options.port = parseInt(options.port, 10);
  }

  let debugPort = undefined;
  if (options.inspectFunctions) {
    debugPort = commandUtils.parseInspectionPort(options);
  }

  utils.assertDefined(options.project);
  const hubClient = new EmulatorHubClient(options.project);

  let remoteEmulators: Record<string, EmulatorInfo> = {};
  if (hubClient.foundHub()) {
    remoteEmulators = await hubClient.getEmulators();
    logger.debug("Running emulators: ", remoteEmulators);
  }

  const runningEmulators = EMULATORS_SUPPORTED_BY_FUNCTIONS.filter(
    (e) => remoteEmulators[e] !== undefined
  );
  const otherEmulators = EMULATORS_SUPPORTED_BY_FUNCTIONS.filter(
    (e) => remoteEmulators[e] === undefined
  );

  const functionsInfo = remoteEmulators[Emulators.FUNCTIONS];
  if (functionsInfo) {
    utils.logLabeledWarning(
      "functions",
      `You are already running the Cloud Functions emulator on port ${functionsInfo.port}. Running the emulator and the Functions shell simultaenously can result in unexpected behavior.`
    );
  } else if (!options.port) {
    // If the user did not pass in any port and the functions emulator is not already running, we can
    // use the port defined for the Functions emulator in their firebase.json
    options.port = options.config.src.emulators?.functions?.port;
  }

  // If the port was not set by the --port flag or determined from 'firebase.json', just scan
  // up from 5000
  if (!options.port) {
    options.port = await findAvailablePort("localhost", 5000);
  }

  return serveFunctions
    .start(options, {
      quiet: true,
      remoteEmulators,
      debugPort,
    })
    .then(() => {
      return serveFunctions.connect();
    })
    .then(() => {
      const instance = serveFunctions.get();
      const emulator = new shell.FunctionsEmulatorShell(instance);

      if (emulator.emulatedFunctions && emulator.emulatedFunctions.length === 0) {
        logger.info("No functions emulated.");
        process.exit();
      }

      const initializeContext = (context: any) => {
        for (const trigger of emulator.triggers) {
          if (emulator.emulatedFunctions.includes(trigger.id)) {
            const localFunction = new LocalFunction(trigger, emulator.urls, emulator);
            const triggerNameDotNotation = trigger.name.replace(/-/g, ".");
            _.set(context, triggerNameDotNotation, localFunction.call);
          }
        }
        context.help =
          "Instructions for the Functions Shell can be found at: " +
          "https://firebase.google.com/docs/functions/local-emulator";
      };

      for (const e of runningEmulators) {
        const info = remoteEmulators[e];
        utils.logLabeledBullet(
          "functions",
          `Connected to running ${clc.bold(e)} emulator at ${info.host}:${
            info.port
          }, calls to this service will affect the emulator`
        );
      }
      utils.logLabeledWarning(
        "functions",
        `The following emulators are not running, calls to these services will affect production: ${clc.bold(
          otherEmulators.join(", ")
        )}`
      );

      const writer = (output: any) => {
        // Prevent full print out of Request object when a request is made
        // @ts-ignore
        if (output instanceof request.Request) {
          return "Sent request to function.";
        }
        return util.inspect(output);
      };

      const prompt = "firebase > ";

      const replServer = repl.start({
        prompt: prompt,
        writer: writer,
        useColors: true,
      });
      initializeContext(replServer.context);
      replServer.on("reset", initializeContext);

      return new Promise((resolve) => {
        replServer.on("exit", () => {
          return serveFunctions.stop().then(resolve).catch(resolve);
        });
      });
    });
};
