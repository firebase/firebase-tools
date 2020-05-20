import {
  Emulators,
  DownloadableEmulators,
  DownloadableEmulatorCommand,
  DownloadableEmulatorDetails,
  EmulatorDownloadDetails,
} from "./types";
import { Constants } from "./constants";

import { FirebaseError } from "../error";
import * as childProcess from "child_process";
import * as utils from "../utils";
import { EmulatorLogger } from "./emulatorLogger";

import * as clc from "cli-color";
import * as fs from "fs-extra";
import * as path from "path";
import * as os from "os";

// tslint:disable-next-line
const downloadEmulator = require("../emulator/download");

const EMULATOR_INSTANCE_KILL_TIMEOUT = 4000; /* ms */

const CACHE_DIR =
  process.env.FIREBASE_EMULATORS_PATH || path.join(os.homedir(), ".cache", "firebase", "emulators");

const DownloadDetails: { [s in DownloadableEmulators]: EmulatorDownloadDetails } = {
  database: {
    downloadPath: path.join(CACHE_DIR, "firebase-database-emulator-v4.5.0.jar"),
    version: "4.5.0",
    opts: {
      cacheDir: CACHE_DIR,
      remoteUrl:
        "https://storage.googleapis.com/firebase-preview-drop/emulator/firebase-database-emulator-v4.5.0.jar",
      expectedSize: 28311004,
      expectedChecksum: "1723857023077462f4b807922b1342f2",
      namePrefix: "firebase-database-emulator",
    },
  },
  firestore: {
    downloadPath: path.join(CACHE_DIR, "cloud-firestore-emulator-v1.11.4.jar"),
    version: "1.11.4",
    opts: {
      cacheDir: CACHE_DIR,
      remoteUrl:
        "https://storage.googleapis.com/firebase-preview-drop/emulator/cloud-firestore-emulator-v1.11.4.jar",
      expectedSize: 63915084,
      expectedChecksum: "53a1e2ee7b8a2b26a46f50167dcf4962",
      namePrefix: "cloud-firestore-emulator",
    },
  },
  ui: {
    version: "0.0.0",
    downloadPath: path.join(CACHE_DIR, "gui-v0.0.0-EAP.zip"),
    unzipDir: path.join(CACHE_DIR, "gui-v0.0.0-EAP"),
    binaryPath: path.join(CACHE_DIR, "gui-v0.0.0-EAP", `server.bundle.js`),
    opts: {
      cacheDir: CACHE_DIR,
      remoteUrl:
        "https://storage.googleapis.com/firebase-preview-drop/emulator/gui-vEAP.zip?_=" +
        new Date().getTime(),
      expectedSize: -1,
      expectedChecksum: "",
      namePrefix: "gui",
      skipChecksumAndSize: true,
      skipCache: true,
    },
  },
  pubsub: {
    downloadPath: path.join(CACHE_DIR, "pubsub-emulator-0.1.0.zip"),
    version: "0.1.0",
    unzipDir: path.join(CACHE_DIR, "pubsub-emulator-0.1.0"),
    binaryPath: path.join(
      CACHE_DIR,
      "pubsub-emulator-0.1.0",
      `pubsub-emulator/bin/cloud-pubsub-emulator${process.platform === "win32" ? ".bat" : ""}`
    ),
    opts: {
      cacheDir: CACHE_DIR,
      remoteUrl:
        "https://storage.googleapis.com/firebase-preview-drop/emulator/pubsub-emulator-0.1.0.zip",
      expectedSize: 36623622,
      expectedChecksum: "81704b24737d4968734d3e175f4cde71",
      namePrefix: "pubsub-emulator",
    },
  },
};

const EmulatorDetails: { [s in DownloadableEmulators]: DownloadableEmulatorDetails } = {
  database: {
    name: Emulators.DATABASE,
    instance: null,
    stdout: null,
  },
  firestore: {
    name: Emulators.FIRESTORE,
    instance: null,
    stdout: null,
  },
  pubsub: {
    name: Emulators.PUBSUB,
    instance: null,
    stdout: null,
  },
  ui: {
    name: Emulators.UI,
    instance: null,
    stdout: null,
  },
};

const Commands: { [s in DownloadableEmulators]: DownloadableEmulatorCommand } = {
  database: {
    binary: "java",
    args: ["-Duser.language=en", "-jar", getExecPath(Emulators.DATABASE)],
    optionalArgs: ["port", "host", "functions_emulator_port", "functions_emulator_host"],
    joinArgs: false,
  },
  firestore: {
    binary: "java",
    args: ["-Duser.language=en", "-jar", getExecPath(Emulators.FIRESTORE)],
    optionalArgs: [
      "port",
      "webchannel_port",
      "host",
      "rules",
      "functions_emulator",
      "seed_from_export",
    ],
    joinArgs: false,
  },
  pubsub: {
    binary: getExecPath(Emulators.PUBSUB)!,
    args: [],
    optionalArgs: ["port", "host"],
    joinArgs: true,
  },
  ui: {
    binary: "node",
    args: [getExecPath(Emulators.UI)],
    optionalArgs: [],
    joinArgs: false,
  },
};

function getExecPath(name: DownloadableEmulators): string {
  const details = getDownloadDetails(name);
  return details.binaryPath || details.downloadPath;
}

export function getLogFileName(name: string): string {
  return `${name}-debug.log`;
}

/**
 * Get a command to start the an emulator.
 * @param emulator - string identifier for the emulator to start.
 * @param args - map<string,string> of addittional args
 */
function _getCommand(
  emulator: DownloadableEmulators,
  args: { [s: string]: any }
): DownloadableEmulatorCommand {
  const baseCmd = Commands[emulator];

  const defaultPort = Constants.getDefaultPort(emulator);
  if (!args.port) {
    args.port = defaultPort;
  }

  const cmdLineArgs = baseCmd.args.slice();

  const logger = EmulatorLogger.forEmulator(emulator);
  Object.keys(args).forEach((key) => {
    if (!baseCmd.optionalArgs.includes(key)) {
      logger.log("DEBUG", `Ignoring unsupported arg: ${key}`);
      return;
    }

    const argKey = "--" + key;
    const argVal = args[key];

    if (argVal === undefined) {
      logger.log("DEBUG", `Ignoring empty arg for key: ${key}`);
      return;
    }

    // Sigh ... RTDB emulator needs "--arg val" and PubSub emulator needs "--arg=val"
    if (baseCmd.joinArgs) {
      cmdLineArgs.push(`${argKey}=${argVal}`);
    } else {
      cmdLineArgs.push(argKey, argVal);
    }
  });

  return {
    binary: baseCmd.binary,
    args: cmdLineArgs,
    optionalArgs: baseCmd.optionalArgs,
    joinArgs: baseCmd.joinArgs,
  };
}

function _fatal(emulator: DownloadableEmulatorDetails, errorMsg: string): void {
  if (emulator.instance) {
    emulator.instance.kill("SIGINT");
  }
  throw new FirebaseError(emulator.name + ": " + errorMsg, { exit: 1 });
}

async function _runBinary(
  emulator: DownloadableEmulatorDetails,
  command: DownloadableEmulatorCommand,
  extraEnv: NodeJS.ProcessEnv
): Promise<void> {
  return new Promise((resolve) => {
    const logger = EmulatorLogger.forEmulator(emulator.name);
    emulator.stdout = fs.createWriteStream(getLogFileName(emulator.name));
    try {
      emulator.instance = childProcess.spawn(command.binary, command.args, {
        env: { ...process.env, ...extraEnv },
        stdio: ["inherit", "pipe", "pipe"],
      });
    } catch (e) {
      if (e.code === "EACCES") {
        // Known issue when WSL users don't have java
        // https://github.com/Microsoft/WSL/issues/3886
        logger.logLabeled(
          "WARN",
          emulator.name,
          `Could not spawn child process for emulator, check that java is installed and on your $PATH.`
        );
      }

      _fatal(emulator, e);
    }

    const description = Constants.description(emulator.name);

    if (emulator.instance == null) {
      logger.logLabeled("WARN", emulator.name, `Could not spawn child process for ${description}.`);
      return;
    }

    logger.logLabeled(
      "BULLET",
      emulator.name,
      `${description} logging to ${clc.bold(getLogFileName(emulator.name))}`
    );

    emulator.instance.stdout.on("data", (data) => {
      logger.log("DEBUG", data.toString());
      emulator.stdout.write(data);
    });
    emulator.instance.stderr.on("data", (data) => {
      logger.log("DEBUG", data.toString());
      emulator.stdout.write(data);
    });

    emulator.instance.on("error", (err: any) => {
      if (err.path === "java" && err.code === "ENOENT") {
        _fatal(
          emulator,
          `${description} has exited because java is not installed, you can install it from https://openjdk.java.net/install/`
        );
      } else {
        _fatal(emulator, `${description} has exited: ${err}`);
      }
    });
    emulator.instance.once("exit", (code, signal) => {
      if (signal) {
        utils.logWarning(`${description} has exited upon receiving signal: ${signal}`);
      } else if (code && code !== 0 && code !== /* SIGINT */ 130) {
        _fatal(emulator, `${description} has exited with code: ${code}`);
      }
    });
    resolve();
  });
}

/**
 * @param emulator
 */
export function getDownloadDetails(emulator: DownloadableEmulators): EmulatorDownloadDetails {
  return DownloadDetails[emulator];
}

/**
 * @param emulator
 */
export function get(emulator: DownloadableEmulators): DownloadableEmulatorDetails {
  return EmulatorDetails[emulator];
}

/**
 * @param targetName
 */
export async function stop(targetName: DownloadableEmulators): Promise<void> {
  const emulator = EmulatorDetails[targetName];
  return new Promise((resolve, reject) => {
    const logger = EmulatorLogger.forEmulator(emulator.name);
    if (emulator.instance) {
      const killTimeout = setTimeout(() => {
        const pid = emulator.instance ? emulator.instance.pid : -1;
        const errorMsg =
          Constants.description(emulator.name) + ": Unable to terminate process (PID=" + pid + ")";
        logger.log("DEBUG", errorMsg);
        reject(new FirebaseError(emulator.name + ": " + errorMsg));
      }, EMULATOR_INSTANCE_KILL_TIMEOUT);

      emulator.instance.once("exit", () => {
        clearTimeout(killTimeout);
        resolve();
      });
      emulator.instance.kill("SIGINT");
    } else {
      resolve();
    }
  });
}

/**
 * @param targetName
 */
export async function downloadIfNecessary(targetName: DownloadableEmulators): Promise<void> {
  const hasEmulator = fs.existsSync(getExecPath(targetName));

  if (hasEmulator) {
    return;
  }

  await downloadEmulator(targetName);
}

/**
 * @param targetName
 * @param args
 * @param extraEnv
 */
export async function start(
  targetName: DownloadableEmulators,
  args: any,
  extraEnv: NodeJS.ProcessEnv = {}
): Promise<void> {
  const downloadDetails = DownloadDetails[targetName];
  const emulator = EmulatorDetails[targetName];
  const hasEmulator = fs.existsSync(getExecPath(targetName));
  const logger = EmulatorLogger.forEmulator(targetName);
  if (!hasEmulator || downloadDetails.opts.skipCache) {
    if (args.auto_download) {
      if (process.env.CI) {
        utils.logWarning(
          `It appears you are running in a CI environment. You can avoid downloading the ${Constants.description(
            targetName
          )} repeatedly by caching the ${downloadDetails.opts.cacheDir} directory.`
        );
      }

      await downloadEmulator(targetName);
    } else {
      utils.logWarning("Setup required, please run: firebase setup:emulators:" + targetName);
      throw new FirebaseError("emulator not found");
    }
  }

  const command = _getCommand(targetName, args);

  logger.log(
    "DEBUG",
    `Starting ${Constants.description(targetName)} with command ${JSON.stringify(command)}`
  );
  return _runBinary(emulator, command, extraEnv);
}
