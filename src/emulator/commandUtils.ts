import * as clc from "colorette";
import * as childProcess from "child_process";

import * as controller from "../emulator/controller";
import { Config } from "../config";
import * as utils from "../utils";
import { logger } from "../logger";
import * as path from "path";
import { Constants } from "./constants";
import { requireAuth } from "../requireAuth";
import { requireConfig } from "../requireConfig";
import { Emulators, ALL_SERVICE_EMULATORS } from "./types";
import { FirebaseError } from "../error";
import { EmulatorRegistry } from "./registry";
import { getProjectId } from "../projectUtils";
import { promptOnce } from "../prompt";
import * as fsutils from "../fsutils";
import Signals = NodeJS.Signals;
import SignalsListener = NodeJS.SignalsListener;
const Table = require("cli-table");
import { emulatorSession } from "../track";
import { setEnvVarsForEmulators } from "./env";

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

export const EXPORT_ON_EXIT_CWD_DANGER = `"${FLAG_EXPORT_ON_EXIT_NAME}" must not point to the current directory or parents. Please choose a new/dedicated directory for exports.`;

export const FLAG_VERBOSITY_NAME = "--log-verbosity";
export const FLAG_VERBOSITY = `${FLAG_VERBOSITY_NAME} <verbosity>`;
export const DESC_VERBOSITY = "One of: DEBUG, INFO, QUIET, SILENT. "; // TODO complete the rest

export const FLAG_UI = "--ui";
export const DESC_UI = "run the Emulator UI";

// Flags for the ext:dev:emulators:* commands
export const FLAG_TEST_CONFIG = "--test-config <firebase.json file>";
export const DESC_TEST_CONFIG =
  "A firebase.json style file. Used to configure the Firestore and Realtime Database emulators.";

export const FLAG_TEST_PARAMS = "--test-params <params.env file>";
export const DESC_TEST_PARAMS =
  "A .env file containing test param values for your emulated extension.";

export const DEFAULT_CONFIG = new Config(
  {
    eventarc: {},
    database: {},
    firestore: {},
    functions: {},
    hosting: {},
    emulators: { auth: {}, pubsub: {} },
  },
  {},
);

export function printNoticeIfEmulated(
  options: any,
  emulator: Emulators.DATABASE | Emulators.FIRESTORE,
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
        `${envKey}=${envVal}`,
      )}, this command will execute against the ${emuName} running at that address.`,
    );
  }
}

export function warnEmulatorNotSupported(
  options: any,
  emulator: Emulators.DATABASE | Emulators.FIRESTORE,
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
        `${envKey}=${envVal}`,
      )}, however this command does not support running against the ${emuName} so this action will affect production.`,
    );

    const opts = {
      confirm: undefined,
    };
    return promptOnce({
      type: "confirm",
      default: false,
      message: "Do you want to continue?",
    }).then(() => {
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
  } catch (e: any) {
    logger.debug(e);
    utils.logLabeledWarning(
      "emulators",
      `You are not currently authenticated so some features may not work correctly. Please run ${clc.bold(
        "firebase login",
      )} to authenticate the CLI.`,
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
      `"${port}" is not a valid port for debugging, please pass an integer between 1024 and 65535.`,
    );
  }

  return parsed;
}

export interface ExportOnExitOptions {
  exportOnExit?: boolean | string;
  import?: string;
}

/**
 * Sets the correct export options based on --import and --export-on-exit. Mutates the options object.
 * Also validates if we have a correct setting we need to export the data on exit.
 * When used as: `--import ./data --export-on-exit` or `--import ./data --export-on-exit ./data`
 * we do allow an non-existing --import [dir] and we just export-on-exit. This because else one would always need to
 * export data the first time they start developing on a clean project.
 * @param options
 */
export function setExportOnExitOptions(options: ExportOnExitOptions): void {
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

    if (path.resolve(".").startsWith(path.resolve(options.exportOnExit))) {
      throw new FirebaseError(EXPORT_ON_EXIT_CWD_DANGER);
    }
  }
  return;
}

function processKillSignal(
  signal: Signals,
  res: (value?: void) => void,
  rej: (value?: unknown) => void,
  options: any,
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
          `Received ${signalDisplay} for the first time. Starting a clean shutdown.`,
        );
        utils.logLabeledBullet(
          "emulators",
          `Please wait for a clean shutdown or send the ${signalDisplay} signal again to stop right now.`,
        );
        // in case of a double 'Ctrl-C' we do not want to cleanly exit with onExit/cleanShutdown
        await controller.onExit(options);
        await controller.cleanShutdown();
      } else {
        logger.debug(`Skipping clean onExit() and cleanShutdown()`);
        const runningEmulatorsInfosWithPid = EmulatorRegistry.listRunningWithInfo().filter((i) =>
          Boolean(i.pid),
        );

        utils.logLabeledWarning(
          "emulators",
          `Received ${signalDisplay} ${signalCount} times. You have forced the Emulator Suite to exit without waiting for ${
            runningEmulatorsInfosWithPid.length
          } subprocess${
            runningEmulatorsInfosWithPid.length > 1 ? "es" : ""
          } to finish. These processes ${clc.bold("may")} still be running on your machine: `,
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
            getListenOverview(emulatorInfo.name) ?? "unknown",
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
    } catch (e: any) {
      logger.debug(e);
      rej();
    }
  };
}

/**
 * Returns a promise that resolves when killing signals are received and processed.
 *
 * Fulfilled or rejected depending on the processing result (e.g. exporting).
 * @return a promise that is pending until signals received and processed
 */
export function shutdownWhenKilled(options: any): Promise<void> {
  return new Promise<void>((res, rej) => {
    ["SIGINT", "SIGTERM", "SIGHUP", "SIGQUIT"].forEach((signal: string) => {
      process.on(signal as Signals, processKillSignal(signal as Signals, res, rej, options));
    });
  }).catch((e) => {
    logger.debug(e);
    utils.logLabeledWarning(
      "emulators",
      "emulators failed to shut down cleanly, see firebase-debug.log for details.",
    );
    throw e;
  });
}

async function runScript(script: string, extraEnv: Record<string, string>): Promise<number> {
  utils.logBullet(`Running script: ${clc.bold(script)}`);

  const env: NodeJS.ProcessEnv = { ...process.env, ...extraEnv };
  // Hyrum's Law strikes here:
  //   Scripts that imported older versions of Firebase Functions SDK accidentally made
  //   the FIREBASE_CONFIG environment variable always available to the script.
  //   Many users ended up depending on this behavior, so we conditionally inject the env var
  //   if the FIREBASE_CONFIG env var isn't explicitly set in the parent process.
  if (env.GCLOUD_PROJECT && !env.FIREBASE_CONFIG) {
    env.FIREBASE_CONFIG = JSON.stringify({
      projectId: env.GCLOUD_PROJECT,
      storageBucket: `${env.GCLOUD_PROJECT}.appspot.com`,
      databaseURL: `https://${env.GCLOUD_PROJECT}.firebaseio.com`,
    });
  }

  const emulatorInfos = EmulatorRegistry.listRunningWithInfo();
  setEnvVarsForEmulators(env, emulatorInfos);

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

/**
 * For overview tables ONLY. Use EmulatorRegistry methods instead for connecting.
 *
 * This method returns a string suitable for printing into CLI outputs, resembling
 * a netloc part of URL. This makes it clickable in many terminal emulators, a
 * specific customer request.
 *
 * Note that this method does not transform the hostname and may return 0.0.0.0
 * etc. that may not work in some browser / OS combinations. When trying to send
 * a network request, use `EmulatorRegistry.client()` instead. When constructing
 * URLs (especially links printed/shown), use `EmulatorRegistry.url()`.
 */
export function getListenOverview(emulator: Emulators): string | undefined {
  const info = EmulatorRegistry.get(emulator)?.getInfo();
  if (!info) {
    return undefined;
  }
  if (info.host.includes(":")) {
    return `[${info.host}]:${info.port}`;
  } else {
    return `${info.host}:${info.port}`;
  }
}

/**
 * The action function for emulators:exec.
 * Starts the appropriate emulators, executes the provided script,
 * and then exits.
 * @param script A script to run after starting the emulators.
 * @param options A Commander options object.
 */
export async function emulatorExec(script: string, options: any): Promise<void> {
  const projectId = getProjectId(options);
  const extraEnv: Record<string, string> = {};
  if (projectId) {
    extraEnv.GCLOUD_PROJECT = projectId;
  }
  const session = emulatorSession();
  if (session && session.debugMode) {
    // Expose session in debug mode to allow running Emulator UI dev server via:
    //     firebase emulators:exec 'npm start'
    extraEnv[Constants.FIREBASE_GA_SESSION] = JSON.stringify(session);
  }
  let exitCode = 0;
  let deprecationNotices;
  try {
    const showUI = !!options.ui;
    ({ deprecationNotices } = await controller.startAll(options, showUI, true));
    exitCode = await runScript(script, extraEnv);
    await controller.onExit(options);
  } finally {
    await controller.cleanShutdown();
  }

  for (const notice of deprecationNotices) {
    utils.logLabeledWarning("emulators", notice, "warn");
  }

  if (exitCode !== 0) {
    throw new FirebaseError(`Script "${clc.bold(script)}" exited with code ${exitCode}`, {
      exit: exitCode,
    });
  }
}

// Regex to extract Java major version. Only works with Java >= 9.
// See: http://openjdk.java.net/jeps/223
const JAVA_VERSION_REGEX = /version "([1-9][0-9]*)/;
const JAVA_HINT = "Please make sure Java is installed and on your system PATH.";

/**
 * Return whether Java major verion is supported. Throws if Java not available.
 *
 * @return Java major version (for Java >= 9) or -1 otherwise
 */
export async function checkJavaMajorVersion(): Promise<number> {
  return new Promise<string>((resolve, reject) => {
    let child;
    try {
      child = childProcess.spawn(
        "java",
        ["-Duser.language=en", "-Dfile.encoding=UTF-8", "-version"],
        {
          stdio: ["inherit", "pipe", "pipe"],
        },
      );
    } catch (err: any) {
      return reject(
        new FirebaseError(`Could not spawn \`java -version\`. ${JAVA_HINT}`, { original: err }),
      );
    }

    let output = "";
    let error = "";
    child.stdout?.on("data", (data) => {
      const str = data.toString("utf8");
      logger.debug(str);
      output += str;
    });
    child.stderr?.on("data", (data) => {
      const str = data.toString("utf8");
      logger.debug(str);
      error += str;
    });

    child.once("error", (err) => {
      reject(
        new FirebaseError(`Could not spawn \`java -version\`. ${JAVA_HINT}`, { original: err }),
      );
    });

    child.once("exit", (code, signal) => {
      if (signal) {
        // This is an unlikely situation where the short-lived Java process to
        // check version was killed by a signal.
        reject(new FirebaseError(`Process \`java -version\` was killed by signal ${signal}.`));
      } else if (code && code !== 0) {
        // `java -version` failed. For example, this may happen on some OS X
        // where `java` is by default a stub that prints out more information on
        // how to install Java. It is critical for us to relay stderr/stdout.
        reject(
          new FirebaseError(
            `Process \`java -version\` has exited with code ${code}. ${JAVA_HINT}\n` +
              `-----Original stdout-----\n${output}` +
              `-----Original stderr-----\n${error}`,
          ),
        );
      } else {
        // Join child process stdout and stderr for further parsing. Order does
        // not matter here because we'll parse only a small part later.
        resolve(`${output}\n${error}`);
      }
    });
  }).then((output) => {
    let versionInt = -1;
    const match = JAVA_VERSION_REGEX.exec(output);
    if (match) {
      const version = match[1];
      versionInt = parseInt(version, 10);
      if (!versionInt) {
        utils.logLabeledWarning(
          "emulators",
          `Failed to parse Java version. Got "${match[0]}".`,
          "warn",
        );
      } else {
        logger.debug(`Parsed Java major version: ${versionInt}`);
      }
    } else {
      // probably Java <= 8 (different version scheme) or unknown
      logger.debug("java -version outputs:", output);
      logger.warn(`Failed to parse Java version.`);
    }
    const session = emulatorSession();
    if (session) {
      session.javaMajorVersion = versionInt;
    }
    return versionInt;
  });
}

export const MIN_SUPPORTED_JAVA_MAJOR_VERSION = 11;
export const JAVA_DEPRECATION_WARNING =
  "firebase-tools no longer supports Java version before 11. " +
  "Please upgrade to Java version 11 or above to continue using the emulators.";
