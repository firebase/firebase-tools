import * as clc from "cli-color";
import * as childProcess from "child_process";

import * as controller from "../emulator/controller";
import * as Config from "../config";
import * as utils from "../utils";
import * as logger from "../logger";
import * as path from "path";
import { Constants } from "./constants";
import { requireAuth } from "../requireAuth";
import requireConfig = require("../requireConfig");
import { Emulators, ALL_SERVICE_EMULATORS } from "./types";
import { FirebaseError } from "../error";
import { EmulatorRegistry } from "./registry";
import { FirestoreEmulator } from "./firestoreEmulator";
import * as getProjectId from "../getProjectId";
import { prompt } from "../prompt";
import { onExit } from "./controller";
import * as fsutils from "../fsutils";
import Signals = NodeJS.Signals;
import SignalsListener = NodeJS.SignalsListener;
import Table = require("cli-table");

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

export const FLAG_EXPORT_ON_EXIT_NAME = "--export-on-exit";
export const FLAG_EXPORT_ON_EXIT = `${FLAG_EXPORT_ON_EXIT_NAME} [dir]`;
export const DESC_EXPORT_ON_EXIT =
  "automatically export emulator data (emulators:export) " +
  "when the emulators make a clean exit (SIGINT), " +
  `when no dir is provided the location of ${FLAG_IMPORT} is used`;
export const EXPORT_ON_EXIT_USAGE_ERROR =
  `"${FLAG_EXPORT_ON_EXIT_NAME}" must be used with "${FLAG_IMPORT}"` +
  ` or provide a dir directly to "${FLAG_EXPORT_ON_EXIT}"`;

export const FLAG_UI = "--ui";
export const DESC_UI = "run the Emulator UI";

// Flags for the ext:dev:emulators:* commands
export const FLAG_TEST_CONFIG = "--test-config <firebase.json file>";
export const DESC_TEST_CONFIG =
  "A firebase.json style file. Used to configure the Firestore and Realtime Database emulators.";

export const FLAG_TEST_PARAMS = "--test-params <params.env file>";
export const DESC_TEST_PARAMS =
  "A .env file containing test param values for your emulated extension.";

const DEFAULT_CONFIG = new Config(
  { database: {}, firestore: {}, functions: {}, hosting: {}, emulators: { auth: {}, pubsub: {} } },
  {}
);

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

  // We want to be able to run most emulators even in the absence of
  // firebase.json. For Functions and Hosting we require the JSON file since the
  // config interactions can become fairly complex.
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

/**
 * Sets the correct export options based on --import and --export-on-exit. Mutates the options object.
 * Also validates if we have a correct setting we need to export the data on exit.
 * When used as: `--import ./data --export-on-exit` or `--import ./data --export-on-exit ./data`
 * we do allow an non-existing --import [dir] and we just export-on-exit. This because else one would always need to
 * export data the first time they start developing on a clean project.
 * @param options
 */
export function setExportOnExitOptions(options: any) {
  if (options.exportOnExit || typeof options.exportOnExit === "string") {
    // note that options.exportOnExit may be a bool when used as a flag without a [dir] argument:
    // --import ./data --export-on-exit
    if (options.import) {
      options.exportOnExit =
        typeof options.exportOnExit === "string" ? options.exportOnExit : options.import;

      const importPath = path.resolve(options.import);
      if (!fsutils.dirExistsSync(importPath) && options.import === options.exportOnExit) {
        // --import path does not exist and is the same as --export-on-exit, let's not import and only --export-on-exit
        options.exportOnExit = options.import;
        delete options.import;
      }
    }

    if (options.exportOnExit === true || !options.exportOnExit) {
      // might be true when only used as a flag without --import [dir]
      // options.exportOnExit might be an empty string when used as:
      // firebase emulators:start --debug --import '' --export-on-exit ''
      throw new FirebaseError(EXPORT_ON_EXIT_USAGE_ERROR);
    }
  }
  return;
}

function processKillSignal(
  signal: Signals,
  res: (value?: unknown) => void,
  rej: (value?: unknown) => void,
  options: any
): SignalsListener {
  let lastSignal = new Date().getTime();
  let signalCount = 0;
  return async () => {
    try {
      const now = new Date().getTime();
      const diff = now - lastSignal;
      if (diff < 100) {
        // If we got a signal twice in 100ms it likely was not an intentional human action.
        // It could be a shaky MacBook keyboard or a known issue with "npm" scripts and signals.
        logger.debug(`Ignoring signal ${signal} due to short delay of ${diff}ms`);
        return;
      }

      signalCount = signalCount + 1;
      lastSignal = now;

      const signalDisplay = signal === "SIGINT" ? `SIGINT (Ctrl-C)` : signal;
      logger.debug(`Received signal ${signalDisplay} ${signalCount}`);
      logger.info(" "); // to not indent the log with the possible Ctrl-C char
      if (signalCount === 1) {
        utils.logLabeledBullet(
          "emulators",
          `Received ${signalDisplay} for the first time. Starting a clean shutdown.`
        );
        utils.logLabeledBullet(
          "emulators",
          `Please wait for a clean shutdown or send the ${signalDisplay} signal again to stop right now.`
        );
        // in case of a double 'Ctrl-C' we do not want to cleanly exit with onExit/cleanShutdown
        await onExit(options);
        await controller.cleanShutdown();
      } else {
        logger.debug(`Skipping clean onExit() and cleanShutdown()`);
        const runningEmulatorsInfosWithPid = EmulatorRegistry.listRunningWithInfo().filter((i) =>
          Boolean(i.pid)
        );

        utils.logLabeledWarning(
          "emulators",
          `Received ${signalDisplay} ${signalCount} times. You have forced the Emulator Suite to exit without waiting for ${
            runningEmulatorsInfosWithPid.length
          } subprocess${
            runningEmulatorsInfosWithPid.length > 1 ? "es" : ""
          } to finish. These processes ${clc.bold("may")} still be running on your machine: `
        );

        const pids: number[] = [];

        const emulatorsTable = new Table({
          head: ["Emulator", "Host:Port", "PID"],
          style: {
            head: ["yellow"],
          },
        });

        for (const emulatorInfo of runningEmulatorsInfosWithPid) {
          pids.push(emulatorInfo.pid as number);
          emulatorsTable.push([
            Constants.description(emulatorInfo.name),
            EmulatorRegistry.getInfoHostString(emulatorInfo),
            emulatorInfo.pid,
          ]);
        }
        logger.info(`\n${emulatorsTable}\n\nTo force them to exit run:\n`);
        if (process.platform === "win32") {
          logger.info(clc.bold(`TASKKILL ${pids.map((pid) => "/PID " + pid).join(" ")} /T\n`));
        } else {
          logger.info(clc.bold(`kill ${pids.join(" ")}\n`));
        }
      }
      res();
    } catch (e) {
      logger.debug(e);
      rej();
    }
  };
}

export function shutdownWhenKilled(options: any): Promise<void> {
  return new Promise((res, rej) => {
    ["SIGINT", "SIGTERM", "SIGHUP", "SIGQUIT"].forEach((signal: string) => {
      process.on(signal as Signals, processKillSignal(signal as Signals, res, rej, options));
    });
  })
    .then(() => {
      process.exit(0);
    })
    .catch((e) => {
      logger.debug(e);
      utils.logLabeledWarning(
        "emulators",
        "emulators failed to shut down cleanly, see firebase-debug.log for details."
      );
      process.exit(1);
    });
}

async function runScript(script: string, extraEnv: Record<string, string>): Promise<number> {
  utils.logBullet(`Running script: ${clc.bold(script)}`);

  const env: NodeJS.ProcessEnv = { ...process.env, ...extraEnv };

  const databaseInstance = EmulatorRegistry.get(Emulators.DATABASE);
  if (databaseInstance) {
    const info = databaseInstance.getInfo();
    const address = EmulatorRegistry.getInfoHostString(info);
    env[Constants.FIREBASE_DATABASE_EMULATOR_HOST] = address;
  }

  const firestoreInstance = EmulatorRegistry.get(Emulators.FIRESTORE);
  if (firestoreInstance) {
    const info = firestoreInstance.getInfo();
    const address = EmulatorRegistry.getInfoHostString(info);

    env[Constants.FIRESTORE_EMULATOR_HOST] = address;
    env[FirestoreEmulator.FIRESTORE_EMULATOR_ENV_ALT] = address;
  }

  const authInstance = EmulatorRegistry.get(Emulators.AUTH);
  if (authInstance) {
    const info = authInstance.getInfo();
    const address = EmulatorRegistry.getInfoHostString(info);
    env[Constants.FIREBASE_AUTH_EMULATOR_HOST] = address;
  }

  const hubInstance = EmulatorRegistry.get(Emulators.HUB);
  if (hubInstance) {
    const info = hubInstance.getInfo();
    const address = EmulatorRegistry.getInfoHostString(info);
    env[Constants.FIREBASE_EMULATOR_HUB] = address;
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
 *  @param script: A script to run after starting the emulators.
 *  @param options: A Commander options object.
 */
export async function emulatorExec(script: string, options: any) {
  shutdownWhenKilled(options);
  const projectId = getProjectId(options, true);
  const extraEnv: Record<string, string> = {};
  if (projectId) {
    extraEnv.GCLOUD_PROJECT = projectId;
  }
  let exitCode = 0;
  try {
    const excludeUi = !options.ui;
    await controller.startAll(options, excludeUi);
    exitCode = await runScript(script, extraEnv);
    await onExit(options);
  } finally {
    await controller.cleanShutdown();
  }

  if (exitCode !== 0) {
    throw new FirebaseError(`Script "${clc.bold(script)}" exited with code ${exitCode}`, {
      exit: exitCode,
    });
  }
}
