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
import { EmulatorRegistry } from "./registry";
import { downloadEmulator } from "../emulator/download";
import { previews } from "../previews";

const EMULATOR_INSTANCE_KILL_TIMEOUT = 4000; /* ms */

const CACHE_DIR =
  process.env.FIREBASE_EMULATORS_PATH || path.join(os.homedir(), ".cache", "firebase", "emulators");

export const DownloadDetails: { [s in DownloadableEmulators]: EmulatorDownloadDetails } = {
  database: {
    downloadPath: path.join(CACHE_DIR, "firebase-database-emulator-v4.7.3.jar"),
    version: "4.7.3",
    opts: {
      cacheDir: CACHE_DIR,
      remoteUrl:
        "https://storage.googleapis.com/firebase-preview-drop/emulator/firebase-database-emulator-v4.7.3.jar",
      expectedSize: 28862098,
      expectedChecksum: "8f696f24ee89c937a789498a0c0e4899",
      namePrefix: "firebase-database-emulator",
    },
  },
  firestore: {
    downloadPath: path.join(CACHE_DIR, "cloud-firestore-emulator-v1.14.3.jar"),
    version: "1.14.3",
    opts: {
      cacheDir: CACHE_DIR,
      remoteUrl:
        "https://storage.googleapis.com/firebase-preview-drop/emulator/cloud-firestore-emulator-v1.14.3.jar",
      expectedSize: 60442855,
      expectedChecksum: "63517534875818689639ee5dee57dd52",
      namePrefix: "cloud-firestore-emulator",
    },
  },
  storage: {
    downloadPath: path.join(CACHE_DIR, "cloud-storage-rules-runtime-v1.0.2.jar"),
    version: "1.0.2",
    opts: {
      cacheDir: CACHE_DIR,
      remoteUrl:
        "https://storage.googleapis.com/firebase-preview-drop/emulator/cloud-storage-rules-runtime-v1.0.2.jar",
      expectedSize: 35704306,
      expectedChecksum: "0dd3e17939610fc3dbdf53fb24cfda86",
      namePrefix: "cloud-storage-rules-emulator",
    },
  },
  ui: previews.extensionsemulator
    ? {
        version: "EXTENSIONS",
        downloadPath: path.join(CACHE_DIR, "ui-vEXTENSIONS.zip"),
        unzipDir: path.join(CACHE_DIR, "ui-vEXTENSIONS"),
        binaryPath: path.join(CACHE_DIR, "ui-vEXTENSIONS", "server.bundle.js"),
        opts: {
          cacheDir: CACHE_DIR,
          remoteUrl:
            "https://storage.googleapis.com/firebase-preview-drop/emulator/ui-vEXTENSIONS.zip",
          expectedSize: -1,
          expectedChecksum: "",
          skipCache: true,
          skipChecksumAndSize: true,
          namePrefix: "ui",
        },
      }
    : previews.emulatoruisnapshot
    ? {
        version: "SNAPSHOT",
        downloadPath: path.join(CACHE_DIR, "ui-vSNAPSHOT.zip"),
        unzipDir: path.join(CACHE_DIR, "ui-vSNAPSHOT"),
        binaryPath: path.join(CACHE_DIR, "ui-vSNAPSHOT", "server.bundle.js"),
        opts: {
          cacheDir: CACHE_DIR,
          remoteUrl:
            "https://storage.googleapis.com/firebase-preview-drop/emulator/ui-vSNAPSHOT.zip",
          expectedSize: -1,
          expectedChecksum: "",
          skipCache: true,
          skipChecksumAndSize: true,
          namePrefix: "ui",
        },
      }
    : {
        version: "1.6.5",
        downloadPath: path.join(CACHE_DIR, "ui-v1.6.5.zip"),
        unzipDir: path.join(CACHE_DIR, "ui-v1.6.5"),
        binaryPath: path.join(CACHE_DIR, "ui-v1.6.5", "server.bundle.js"),
        opts: {
          cacheDir: CACHE_DIR,
          remoteUrl: "https://storage.googleapis.com/firebase-preview-drop/emulator/ui-v1.6.5.zip",
          expectedSize: 3816994,
          expectedChecksum: "92dfff4b2ef8ab616e8a60cc93e0a00b",
          namePrefix: "ui",
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
  storage: {
    name: Emulators.STORAGE,
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
    args: [
      "-Dgoogle.cloud_firestore.debug_log_level=FINE",
      "-Duser.language=en",
      "-jar",
      getExecPath(Emulators.FIRESTORE),
    ],
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
  storage: {
    // This is for the Storage Emulator rules runtime, which is started
    // separately in ./storage/runtime.ts (not via the start function below).
    binary: "java",
    args: [
      // Required for rules error/warning messages, which are in English only.
      // Attempts to fetch the messages in another language leads to crashes.
      "-Duser.language=en",
      "-jar",
      getExecPath(Emulators.STORAGE),
      "serve",
    ],
    optionalArgs: [],
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

/**
 * @param name
 */
export function getLogFileName(name: string): string {
  return `${name}-debug.log`;
}

/**
 * Get a command to start the an emulator.
 * @param emulator - string identifier for the emulator to start.
 * @param args - map<string,string> of addittional args
 */
export function _getCommand(
  emulator: DownloadableEmulators,
  args: { [s: string]: any }
): DownloadableEmulatorCommand {
  const baseCmd = Commands[emulator];

  const defaultPort = Constants.getDefaultPort(emulator);
  if (!args.port) {
    args.port = defaultPort;
  }

  const cmdLineArgs = baseCmd.args.slice();

  if (
    baseCmd.binary === "java" &&
    utils.isRunningInWSL() &&
    (!args.host || !args.host.includes(":"))
  ) {
    // HACK(https://github.com/firebase/firebase-tools-ui/issues/332): Force
    // Java to use IPv4 sockets in WSL (unless IPv6 address explicitly used).
    // Otherwise, Java will open a tcp6 socket (even if IPv4 address is used),
    // which handles both 4/6 on Linux but NOT IPv4 from the host to WSL.
    // This is a hack because it breaks all IPv6 connections as a side effect.
    // See: https://docs.oracle.com/javase/8/docs/api/java/net/doc-files/net-properties.html
    cmdLineArgs.unshift("-Djava.net.preferIPv4Stack=true"); // first argument
  }

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

async function _fatal(emulator: Emulators, errorMsg: string): Promise<void> {
  // if we do not issue a stopAll here and _fatal is called during startup, we could leave emulators running
  // that did start already
  // for example: JAVA_HOME=/does/not/exist firebase emulators:start
  try {
    const logger = EmulatorLogger.forEmulator(emulator);
    logger.logLabeled(
      "WARN",
      emulator,
      `Fatal error occurred: \n   ${errorMsg}, \n   stopping all running emulators`
    );
    await EmulatorRegistry.stopAll();
  } finally {
    process.exit(1);
  }
}

export async function handleEmulatorProcessError(emulator: Emulators, err: any): Promise<void> {
  const description = Constants.description(emulator);
  if (err.path === "java" && err.code === "ENOENT") {
    await _fatal(
      emulator,
      `${description} has exited because java is not installed, you can install it from https://openjdk.java.net/install/`
    );
  } else {
    await _fatal(emulator, `${description} has exited: ${err}`);
  }
}

export function requiresJava(emulator: Emulators): boolean {
  if (emulator in Commands) {
    return Commands[emulator as keyof typeof Commands].binary === "java";
  }
  return false;
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
        // `detached` must be true as else a SIGINT (Ctrl-c) will stop the child process before we can handle a
        // graceful shutdown and call `downloadableEmulators.stop(...)` ourselves.
        // Note that it seems to be a problem with gRPC processes for which a fix may be found on the Java side
        // related to this issue: https://github.com/grpc/grpc-java/pull/6512
        detached: true,
        stdio: ["inherit", "pipe", "pipe"],
      });
    } catch (e: any) {
      if (e.code === "EACCES") {
        // Known issue when WSL users don't have java
        // https://github.com/Microsoft/WSL/issues/3886
        logger.logLabeled(
          "WARN",
          emulator.name,
          `Could not spawn child process for emulator, check that java is installed and on your $PATH.`
        );
      }
      _fatal(emulator.name, e);
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

    emulator.instance.stdout?.on("data", (data) => {
      logger.log("DEBUG", data.toString());
      emulator.stdout.write(data);
    });
    emulator.instance.stderr?.on("data", (data) => {
      logger.log("DEBUG", data.toString());
      emulator.stdout.write(data);

      if (data.toString().includes("java.lang.UnsupportedClassVersionError")) {
        logger.logLabeled(
          "WARN",
          emulator.name,
          "Unsupported java version, make sure java --version reports 1.8 or higher."
        );
      }
    });

    emulator.instance.on("error", (err) => {
      handleEmulatorProcessError(emulator.name, err);
    });

    emulator.instance.once("exit", async (code, signal) => {
      if (signal) {
        utils.logWarning(`${description} has exited upon receiving signal: ${signal}`);
      } else if (code && code !== 0 && code !== /* SIGINT */ 130) {
        await _fatal(emulator.name, `${description} has exited with code: ${code}`);
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
 * Returns the PID of the emulator process
 * @param emulator
 */
export function getPID(emulator: DownloadableEmulators): number {
  const emulatorInstance = get(emulator).instance;
  return emulatorInstance && emulatorInstance.pid ? emulatorInstance.pid : 0;
}

/**
 * @param targetName
 */
export async function stop(targetName: DownloadableEmulators): Promise<void> {
  const emulator = get(targetName);
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
  const emulator = get(targetName);
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
