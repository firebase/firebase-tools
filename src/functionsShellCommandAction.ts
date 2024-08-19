/* eslint-disable @typescript-eslint/ban-ts-comment */
import * as clc from "colorette";
import * as repl from "repl";
import * as _ from "lodash";
import * as util from "util";

import * as shell from "./emulator/functionsEmulatorShell";
import * as commandUtils from "./emulator/commandUtils";
import { FunctionsServer } from "./serve/functions";
import LocalFunction from "./localFunction";
import * as utils from "./utils";
import { logger } from "./logger";
import { EMULATORS_SUPPORTED_BY_FUNCTIONS, EmulatorInfo, Emulators } from "./emulator/types";
import { EmulatorHubClient } from "./emulator/hubClient";
import { resolveHostAndAssignPorts } from "./emulator/portUtils";
import { Constants } from "./emulator/constants";
import { Options } from "./options";
import { HTTPS_SENTINEL } from "./localFunction";
import { needProjectId } from "./projectUtils";

const serveFunctions = new FunctionsServer();

export const actionFunction = async (options: Options) => {
  if (typeof options.port === "string") {
    options.port = parseInt(options.port, 10);
  }

  let debugPort = undefined;
  if (options.inspectFunctions) {
    debugPort = commandUtils.parseInspectionPort(options);
  }

  needProjectId(options);
  const hubClient = new EmulatorHubClient(options.project!);

  let remoteEmulators: Record<string, EmulatorInfo> = {};
  if (hubClient.foundHub()) {
    remoteEmulators = await hubClient.getEmulators();
    logger.debug("Running emulators: ", remoteEmulators);
  }

  const runningEmulators = EMULATORS_SUPPORTED_BY_FUNCTIONS.filter(
    (e) => remoteEmulators[e] !== undefined,
  );
  const otherEmulators = EMULATORS_SUPPORTED_BY_FUNCTIONS.filter(
    (e) => remoteEmulators[e] === undefined,
  );

  let host = Constants.getDefaultHost();
  // If the port was not set by the --port flag or determined from 'firebase.json', just scan
  // up from 5000
  let port = 5000;
  if (typeof options.port === "number") {
    port = options.port;
  }

  const functionsInfo = remoteEmulators[Emulators.FUNCTIONS];
  if (functionsInfo) {
    utils.logLabeledWarning(
      "functions",
      `You are already running the Cloud Functions emulator on port ${functionsInfo.port}. Running the emulator and the Functions shell simultaenously can result in unexpected behavior.`,
    );
  } else if (!options.port) {
    // If the user did not pass in any port and the functions emulator is not already running, we can
    // use the port defined for the Functions emulator in their firebase.json
    port = options.config.src.emulators?.functions?.port ?? port;
    host = options.config.src.emulators?.functions?.host ?? host;
    options.host = host;
  }

  const listen = (
    await resolveHostAndAssignPorts({
      [Emulators.FUNCTIONS]: { host, port },
    })
  ).functions;
  // TODO: Listen on secondary addresses.
  options.host = listen[0].address;
  options.port = listen[0].port;

  return serveFunctions
    .start(options, {
      verbosity: "QUIET",
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
            _.set(context, triggerNameDotNotation, localFunction.makeFn());
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
          }, calls to this service will affect the emulator`,
        );
      }
      utils.logLabeledWarning(
        "functions",
        `The following emulators are not running, calls to these services will affect production: ${clc.bold(
          otherEmulators.join(", "),
        )}`,
      );

      const writer = (output: any) => {
        if (output === HTTPS_SENTINEL) {
          return HTTPS_SENTINEL;
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
