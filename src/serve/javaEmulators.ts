import { Emulators, JavaEmulatorCommand, JavaEmulatorDetails } from "../emulator/types";
import { Constants } from "../emulator/constants";

import { FirebaseError } from "../error";
import * as childProcess from "child_process";
import * as utils from "../utils";
import * as logger from "../logger";

import * as clc from "cli-color";
import * as fs from "fs-extra";
import * as path from "path";
import * as os from "os";

// tslint:disable-next-line
const downloadEmulator = require("../emulator/download");

const EMULATOR_INSTANCE_KILL_TIMEOUT = 2000; /* ms */

type JavaEmulators = Emulators.FIRESTORE | Emulators.DATABASE;

const CACHE_DIR =
  process.env.FIREBASE_EMULATORS_PATH || path.join(os.homedir(), ".cache", "firebase", "emulators");

const EmulatorDetails: { [s in JavaEmulators]: JavaEmulatorDetails } = {
  database: {
    name: Emulators.DATABASE,
    instance: null,
    stdout: null,
    cacheDir: CACHE_DIR,
    remoteUrl:
      "https://storage.googleapis.com/firebase-preview-drop/emulator/firebase-database-emulator-v4.2.0.jar",
    expectedSize: 17131418,
    expectedChecksum: "d9d825b2f321e05ca8dc9b758eec6ba6",
    localPath: path.join(CACHE_DIR, "firebase-database-emulator-v4.2.0.jar"),
    namePrefix: "firebase-database-emulator",
  },
  firestore: {
    name: Emulators.FIRESTORE,
    instance: null,
    stdout: null,
    cacheDir: CACHE_DIR,
    remoteUrl:
      "https://storage.googleapis.com/firebase-preview-drop/emulator/cloud-firestore-emulator-v1.10.0.jar",
    expectedSize: 62550064,
    expectedChecksum: "a19e8b6bbd13de667625866bd46295d5",
    localPath: path.join(CACHE_DIR, "cloud-firestore-emulator-v1.10.0.jar"),
    namePrefix: "cloud-firestore-emulator",
  },
};

const Commands: { [s in JavaEmulators]: JavaEmulatorCommand } = {
  database: {
    binary: "java",
    args: ["-Duser.language=en", "-jar", EmulatorDetails.database.localPath],
    optionalArgs: ["port", "host", "functions_emulator_port", "functions_emulator_host"],
  },
  firestore: {
    binary: "java",
    args: ["-Duser.language=en", "-jar", EmulatorDetails.firestore.localPath],
    optionalArgs: ["port", "webchannel_port", "host", "rules", "functions_emulator"],
  },
};

function _getLogFileName(name: string): string {
  return `${name}-debug.log`;
}

/**
 * Get a command to start the an emulator.
 * @param emulator - string identifier for the emulator to start.
 * @param args - map<string,string> of addittional args
 */
function _getCommand(emulator: JavaEmulators, args: { [s: string]: any }): JavaEmulatorCommand {
  const baseCmd = Commands[emulator];

  const defaultPort = Constants.getDefaultPort(emulator);
  if (!args.port) {
    args.port = defaultPort;
  }

  const cmdLineArgs = baseCmd.args.slice();
  Object.keys(args).forEach((key) => {
    if (baseCmd.optionalArgs.indexOf(key) < 0) {
      logger.debug(`Ignoring unsupported arg: ${key}`);
      return;
    }

    const argKey = "--" + key;
    const argVal = args[key];

    cmdLineArgs.push(argKey, argVal);
  });

  return {
    binary: baseCmd.binary,
    args: cmdLineArgs,
    optionalArgs: baseCmd.optionalArgs,
  };
}

function _fatal(emulator: JavaEmulatorDetails, errorMsg: string): void {
  if (emulator.instance) {
    emulator.instance.kill("SIGINT");
  }
  throw new FirebaseError(emulator.name + ": " + errorMsg, { exit: 1 });
}

async function _runBinary(
  emulator: JavaEmulatorDetails,
  command: JavaEmulatorCommand
): Promise<void> {
  return new Promise((resolve) => {
    emulator.stdout = fs.createWriteStream(_getLogFileName(emulator.name));
    try {
      emulator.instance = childProcess.spawn(command.binary, command.args, {
        stdio: ["inherit", "pipe", "pipe"],
      });
    } catch (e) {
      if (e.code === "EACCES") {
        // Known issue when WSL users don't have java
        // https://github.com/Microsoft/WSL/issues/3886
        utils.logLabeledWarning(
          emulator.name,
          `Could not spawn child process for emulator, check that java is installed and on your $PATH.`
        );
      }

      _fatal(emulator, e);
    }

    if (emulator.instance == null) {
      utils.logLabeledWarning(emulator.name, "Could not spawn child process for emulator.");
      return;
    }

    utils.logLabeledBullet(
      emulator.name,
      `Emulator logging to ${clc.bold(_getLogFileName(emulator.name))}`
    );

    emulator.instance.stdout.on("data", (data) => {
      logger.debug(data.toString());
      emulator.stdout.write(data);
    });
    emulator.instance.stderr.on("data", (data) => {
      logger.debug(data.toString());
      emulator.stdout.write(data);
    });

    emulator.instance.on("error", (err: any) => {
      if (err.path === "java" && err.code === "ENOENT") {
        _fatal(
          emulator,
          "emulator has exited because java is not installed, you can install it from https://openjdk.java.net/install/"
        );
      } else {
        _fatal(emulator, "emulator has exited: " + err);
      }
    });
    emulator.instance.once("exit", (code, signal) => {
      if (signal) {
        utils.logWarning(`${emulator.name} emulator has exited upon receiving signal: ${signal}`);
      } else if (code && code !== 0 && code !== /* SIGINT */ 130) {
        _fatal(emulator, `emulator has exited with code: ${code}`);
      }
    });
    resolve();
  });
}

export function get(emulator: JavaEmulators): JavaEmulatorDetails {
  return EmulatorDetails[emulator];
}

export async function stop(targetName: JavaEmulators): Promise<void> {
  const emulator = EmulatorDetails[targetName];
  return new Promise((resolve, reject) => {
    if (emulator.instance) {
      const killTimeout = setTimeout(() => {
        const pid = emulator.instance ? emulator.instance.pid : -1;
        const errorMsg = emulator.name + ": Unable to terminate emulator process (PID=" + pid + ")";
        logger.debug(errorMsg);
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

export async function start(targetName: JavaEmulators, args: any): Promise<void> {
  const emulator = EmulatorDetails[targetName];

  const hasEmulator = fs.existsSync(emulator.localPath);
  if (!hasEmulator) {
    if (args.auto_download) {
      if (process.env.CI) {
        utils.logWarning(
          `It appears you are running in a CI environment. You can avoid downloading the ${
            emulator.name
          } emulator repeatedly by caching the ${emulator.cacheDir} directory.`
        );
      }

      await downloadEmulator(targetName);
    } else {
      utils.logWarning("Setup required, please run: firebase setup:emulators:" + emulator.name);
      throw new FirebaseError("emulator not found");
    }
  }

  const command = _getCommand(targetName, args);
  logger.debug(`Starting emulator ${targetName} with command ${JSON.stringify(command)}`);
  return _runBinary(emulator, command);
}
