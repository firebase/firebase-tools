import * as clc from "cli-color";
import * as controller from "../emulator/controller";
import * as Config from "../config";
import * as utils from "../utils";
import * as logger from "../logger";
import requireAuth = require("../requireAuth");
import requireConfig = require("../requireConfig");
import { Emulators, ALL_SERVICE_EMULATORS } from "../emulator/types";
import { FirebaseError } from "../error";

export const FLAG_ONLY: string = "--only <emulators>";
export const DESC_ONLY: string =
  "only run specific emulators. " +
  "This is a comma separated list of emulators to start. " +
  "Valid options are: " +
  JSON.stringify(ALL_SERVICE_EMULATORS);

export const FLAG_INSPECT_FUNCTIONS = "--inspect-functions [port]";
export const DESC_INSPECT_FUNCTIONS =
  "emulate Cloud Functions in debug mode with the node inspector on the given port (9229 if not specified)";

/**
 * We want to be able to run the Firestore and Database emulators even in the absence
 * of firebase.json. For Functions and Hosting we require the JSON file since the
 * config interactions can become fairly complex.
 */
const DEFAULT_CONFIG = new Config({ database: {}, firestore: {}, functions: {}, hosting: {} }, {});

export async function beforeEmulatorCommand(options: any): Promise<any> {
  const optionsWithDefaultConfig = {
    ...options,
    config: DEFAULT_CONFIG,
  };
  const optionsWithConfig = options.config ? options : optionsWithDefaultConfig;
  const canStartWithoutConfig =
    options.only &&
    !controller.shouldStart(optionsWithConfig, Emulators.FUNCTIONS) &&
    !controller.shouldStart(optionsWithConfig, Emulators.HOSTING);

  try {
    await requireAuth(options);
  } catch (e) {
    logger.debug(e);
    utils.logLabeledWarning(
      "emulators",
      `You are not currently authenticated so some features may not work correctly. Please run ${clc.bold(
        "firebase login"
      )} to authenticate the CLI.`
    );
  }

  if (canStartWithoutConfig && !options.config) {
    utils.logWarning("Could not find config (firebase.json) so using defaults.");
    options.config = DEFAULT_CONFIG;
  } else {
    await requireConfig(options);
  }
}

export function parseInspectionPort(options: any): number {
  let port = options.inspectFunctions;
  if (port === true) {
    port = "9229";
  }

  const parsed = Number(port);
  if (isNaN(parsed) || parsed < 1024 || parsed > 65535) {
    throw new FirebaseError(
      `"${port}" is not a valid port for debugging, please pass an integer between 1024 and 65535.`
    );
  }

  return parsed;
}
