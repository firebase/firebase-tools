import * as clc from "cli-color";
import * as childProcess from "child_process";

import * as controller from "../emulator/controller";
import * as Config from "../config";
import * as utils from "../utils";
import * as logger from "../logger";
import { Constants } from "./constants";
import { requireAuth } from "../requireAuth";
import requireConfig = require("../requireConfig");
import { Emulators, ALL_SERVICE_EMULATORS } from "../emulator/types";
import { FirebaseError } from "../error";
import { EmulatorRegistry } from "../emulator/registry";
import { FirestoreEmulator } from "../emulator/firestoreEmulator";
import * as getProjectId from "../getProjectId";
import { prompt } from "../prompt";
import { EmulatorHub } from "./hub";

export const FLAG_ONLY = "--only <emulators>";
export const DESC_ONLY =
  "only specific emulators. " +
  "This is a comma separated list of emulator names. " +
  "Valid options are: " +
  JSON.stringify(ALL_SERVICE_EMULATORS);

export const FLAG_INSPECT_FUNCTIONS = "--inspect-functions [port]";
export const DESC_INSPECT_FUNCTIONS =
  "emulate Cloud Functions in debug mode with the node inspector on the given port (9229 if not specified)";

export const FLAG_IMPORT = "--import [dir]";
export const DESC_IMPORT = "import emulator data from a previous export (see emulators:export)";

// Flags for the ext:dev:emulators:* commands
export const FLAG_TEST_CONFIG = "--test-config <firebase.json file>";
export const DESC_TEST_CONFIG =
  "A firebase.json style file. Used to configure the Firestore and Realtime Database emulators.";

export const FLAG_TEST_PARAMS = "--test-params <params.env file>";
export const DESC_TEST_PARAMS =
  "A .env file containing test param values for your emulated extension.";

/**
 * We want to be able to run the Firestore and Database emulators even in the absence
 * of firebase.json. For Functions and Hosting we require the JSON file since the
 * config interactions can become fairly complex.
 */
const DEFAULT_CONFIG = new Config({ database: {}, firestore: {}, functions: {}, hosting: {} }, {});

export function printNoticeIfEmulated(
  options: any,
  emulator: Emulators.DATABASE | Emulators.FIRESTORE
): void {
  if (emulator !== Emulators.DATABASE && emulator !== Emulators.FIRESTORE) {
    return;
  }

  const emuName = Constants.description(emulator);
  const envKey =
    emulator === Emulators.DATABASE
      ? Constants.FIREBASE_DATABASE_EMULATOR_HOST
      : Constants.FIRESTORE_EMULATOR_HOST;
  const envVal = process.env[envKey];
  if (envVal) {
    utils.logBullet(
      `You have set ${clc.bold(
        `${envKey}=${envVal}`
      )}, this command will execute against the ${emuName} running at that address.`
    );
  }
}

export function warnEmulatorNotSupported(
  options: any,
  emulator: Emulators.DATABASE | Emulators.FIRESTORE
): void | Promise<void> {
  if (emulator !== Emulators.DATABASE && emulator !== Emulators.FIRESTORE) {
    return;
  }

  const emuName = Constants.description(emulator);
  const envKey =
    emulator === Emulators.DATABASE
      ? Constants.FIREBASE_DATABASE_EMULATOR_HOST
      : Constants.FIRESTORE_EMULATOR_HOST;
  const envVal = process.env[envKey];

  if (envVal) {
    utils.logWarning(
      `You have set ${clc.bold(
        `${envKey}=${envVal}`
      )}, however this command does not support running against the ${emuName} so this action will affect production.`
    );

    const opts = {
      confirm: undefined,
    };
    return prompt(opts, [
      {
        type: "confirm",
        name: "confirm",
        default: false,
        message: "Do you want to continue?",
      },
    ]).then(() => {
      if (!opts.confirm) {
        return utils.reject("Command aborted.", { exit: 1 });
      }
    });
  }
}

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

async function runScript(script: string, extraEnv: Record<string, string>): Promise<number> {
  utils.logBullet(`Running script: ${clc.bold(script)}`);

  const env: NodeJS.ProcessEnv = { ...process.env, ...extraEnv };

  const databaseInstance = EmulatorRegistry.get(Emulators.DATABASE);
  if (databaseInstance) {
    const info = databaseInstance.getInfo();
    const address = `${info.host}:${info.port}`;
    env[Constants.FIREBASE_DATABASE_EMULATOR_HOST] = address;
  }

  const firestoreInstance = EmulatorRegistry.get(Emulators.FIRESTORE);
  if (firestoreInstance) {
    const info = firestoreInstance.getInfo();
    const address = `${info.host}:${info.port}`;

    env[Constants.FIRESTORE_EMULATOR_HOST] = address;
    env[FirestoreEmulator.FIRESTORE_EMULATOR_ENV_ALT] = address;
  }

  const hubInstance = EmulatorRegistry.get(Emulators.HUB);
  if (hubInstance) {
    const info = hubInstance.getInfo();
    const address = `${info.host}:${info.port}`;
    env[EmulatorHub.EMULATOR_HUB_ENV] = address;
  }

  const proc = childProcess.spawn(script, {
    stdio: ["inherit", "inherit", "inherit"] as childProcess.StdioOptions,
    shell: true,
    windowsHide: true,
    env,
  });

  logger.debug(`Running ${script} with environment ${JSON.stringify(env)}`);

  return new Promise((resolve, reject) => {
    proc.on("error", (err: any) => {
      utils.logWarning(`There was an error running the script: ${JSON.stringify(err)}`);
      reject();
    });

    // Due to the async nature of the node child_process library, sometimes
    // we can get the "exit" callback before all "data" has been read from
    // from the script's output streams. To make the logs look cleaner, we
    // add a short delay before resolving/rejecting this promise after an
    // exit.
    const exitDelayMs = 500;
    proc.once("exit", (code, signal) => {
      if (signal) {
        utils.logWarning(`Script exited with signal: ${signal}`);
        setTimeout(reject, exitDelayMs);
        return;
      }

      const exitCode = code || 0;
      if (code === 0) {
        utils.logSuccess(`Script exited successfully (code 0)`);
      } else {
        utils.logWarning(`Script exited unsuccessfully (code ${code})`);
      }

      setTimeout(() => {
        resolve(exitCode);
      }, exitDelayMs);
    });
  });
}

/** The action function for emulators:exec and ext:dev:emulators:exec.
 *  Starts the appropriate emulators, executes the provided script,
 *  and then exits.
 *  @param script: A script to run after starting the emualtors.
 *  @param options: A Commander options object.
 */
export async function emulatorExec(script: string, options: any) {
  const projectId = getProjectId(options, true);
  const extraEnv: Record<string, string> = {};
  if (projectId) {
    extraEnv.GCLOUD_PROJECT = projectId;
  }
  let exitCode = 0;
  try {
    await controller.startAll(options, /* noGui = */ true);
    exitCode = await runScript(script, extraEnv);
  } finally {
    await controller.cleanShutdown();
  }

  if (exitCode !== 0) {
    throw new FirebaseError(`Script "${clc.bold(script)}" exited with code ${exitCode}`, {
      exit: exitCode,
    });
  }
}
