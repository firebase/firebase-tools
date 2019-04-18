"use strict";

import { Emulators, JavaEmulatorCommand, JavaEmulatorDetails } from "../emulator/types";
import { Constants } from "../emulator/constants";

import * as FirebaseError from "../error";
import * as childProcess from "child_process";
import * as utils from "../utils";
import * as logger from "../logger";

import * as clc from "cli-color";
import * as fs from "fs-extra";
import * as path from "path";
import * as userHome from "user-home";

const EMULATOR_INSTANCE_KILL_TIMEOUT = 2000; /* ms */

type JavaEmulators = Emulators.FIRESTORE | Emulators.DATABASE;

const CACHE_DIR =
  process.env.FIREBASE_EMULATORS_PATH || path.join(userHome, ".cache", "firebase", "emulators");

const EmulatorDetails: { [s in JavaEmulators]: JavaEmulatorDetails } = {
  database: {
    name: "database",
    instance: null,
    stdout: null,
    cacheDir: CACHE_DIR,
    remoteUrl:
      "https://storage.googleapis.com/firebase-preview-drop/emulator/firebase-database-emulator-v3.5.0.jar",
    expectedSize: 17013124,
    expectedChecksum: "4bc8a67bc2a11d3e7ed226eda1b1a986",
    localPath: path.join(CACHE_DIR, "firebase-database-emulator-v3.5.0.jar"),
  },
  firestore: {
    name: "firestore",
    instance: null,
    stdout: null,
    cacheDir: CACHE_DIR,
    remoteUrl:
      "https://storage.googleapis.com/firebase-preview-drop/emulator/cloud-firestore-emulator-v1.4.4.jar",
    expectedSize: 56904597,
    expectedChecksum: "b64aa203304f231b61ad7c30316d1094",
    localPath: path.join(CACHE_DIR, "cloud-firestore-emulator-v1.4.4.jar"),
  },
};

const Commands: { [s in JavaEmulators]: JavaEmulatorCommand } = {
  database: {
    binary: "java",
    args: ["-Duser.language=en", "-jar", EmulatorDetails.database.localPath],
  },
  firestore: {
    binary: "java",
    args: ["-Duser.language=en", "-jar", EmulatorDetails.firestore.localPath],
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
    const argKey = "--" + key;
    const argVal = args[key];

    cmdLineArgs.push(argKey, argVal);
  });

  return {
    binary: baseCmd.binary,
    args: cmdLineArgs,
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
    emulator.instance = childProcess.spawn(command.binary, command.args, {
      stdio: ["inherit", "pipe", "pipe"],
    });

    if (emulator.instance == null) {
      utils.logWarning(`Could not spawn child process for emulator ${emulator.name}`);
      return;
    }

    utils.logLabeledBullet(emulator.name, `Logging to ${clc.bold(_getLogFileName(emulator.name))}`);

    emulator.instance.stdout.on("data", (data) => {
      // TODO: Enable this if --debug is passed
      // process.stdout.write(data.toString());
      emulator.stdout.write(data.toString());
    });
    emulator.instance.stderr.on("data", (data) => {
      emulator.stdout.write(data.toString());
      utils.logWarning(emulator.name + ": " + data.toString());
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
  const command = _getCommand(targetName, args);
  if (!fs.existsSync(emulator.localPath)) {
    utils.logWarning("Setup required, please run: firebase setup:emulators:" + emulator.name);
    return Promise.reject("emulator not found");
  }

  return _runBinary(emulator, command);
}
