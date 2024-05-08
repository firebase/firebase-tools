import {
  Emulators,
  DownloadableEmulators,
  DownloadableEmulatorCommand,
  DownloadableEmulatorDetails,
  EmulatorDownloadDetails,
  EmulatorUpdateDetails,
} from "./types";
import { Constants } from "./constants";

import { FirebaseError } from "../error";
import * as childProcess from "child_process";
import * as utils from "../utils";
import { EmulatorLogger } from "./emulatorLogger";

import * as clc from "colorette";
import * as fs from "fs-extra";
import * as path from "path";
import * as os from "os";
import { EmulatorRegistry } from "./registry";
import { downloadEmulator } from "../emulator/download";
import * as experiments from "../experiments";

const EMULATOR_INSTANCE_KILL_TIMEOUT = 4000; /* ms */

const CACHE_DIR =
  process.env.FIREBASE_EMULATORS_PATH || path.join(os.homedir(), ".cache", "firebase", "emulators");

const EMULATOR_UPDATE_DETAILS: { [s in DownloadableEmulators]: EmulatorUpdateDetails } = {
  database: {
    version: "4.11.2",
    expectedSize: 34495935,
    expectedChecksum: "2fd771101c0e1f7898c04c9204f2ce63",
  },
  firestore: {
    version: "1.19.5",
    expectedSize: 66204670,
    expectedChecksum: "6d9fb826605701668af722f25048ad95",
  },
  storage: {
    version: "1.1.3",
    expectedSize: 52892936,
    expectedChecksum: "2ca11ec1193003bea89f806cc085fa25",
  },
  ui: experiments.isEnabled("emulatoruisnapshot")
    ? { version: "SNAPSHOT", expectedSize: -1, expectedChecksum: "" }
    : {
        version: "1.11.8",
        expectedSize: 3523907,
        expectedChecksum: "49f6dc1911dda9d10df62a6c09aaf9a0",
      },
  pubsub: {
    version: "0.8.2",
    expectedSize: 65611398,
    expectedChecksum: "70bb840321423e6ae621a3ae2f314903",
  },
  dataconnect:
    process.platform === "darwin"
      ? {
          version: "1.1.15",
          expectedSize: 25600896,
          expectedChecksum: "36dcf9be7273b9ba6052faf0b3c0347f",
        }
      : {
          version: "1.1.15",
          expectedSize: 23036688,
          expectedChecksum: "e42203947bf984993f295976ee3ba2be",
        },
};

export const DownloadDetails: { [s in DownloadableEmulators]: EmulatorDownloadDetails } = {
  database: {
    downloadPath: path.join(
      CACHE_DIR,
      `firebase-database-emulator-v${EMULATOR_UPDATE_DETAILS.database.version}.jar`,
    ),
    version: EMULATOR_UPDATE_DETAILS.database.version,
    opts: {
      cacheDir: CACHE_DIR,
      remoteUrl: `https://storage.googleapis.com/firebase-preview-drop/emulator/firebase-database-emulator-v${EMULATOR_UPDATE_DETAILS.database.version}.jar`,
      expectedSize: EMULATOR_UPDATE_DETAILS.database.expectedSize,
      expectedChecksum: EMULATOR_UPDATE_DETAILS.database.expectedChecksum,
      namePrefix: "firebase-database-emulator",
    },
  },
  firestore: {
    downloadPath: path.join(
      CACHE_DIR,
      `cloud-firestore-emulator-v${EMULATOR_UPDATE_DETAILS.firestore.version}.jar`,
    ),
    version: EMULATOR_UPDATE_DETAILS.firestore.version,
    opts: {
      cacheDir: CACHE_DIR,
      remoteUrl: `https://storage.googleapis.com/firebase-preview-drop/emulator/cloud-firestore-emulator-v${EMULATOR_UPDATE_DETAILS.firestore.version}.jar`,
      expectedSize: EMULATOR_UPDATE_DETAILS.firestore.expectedSize,
      expectedChecksum: EMULATOR_UPDATE_DETAILS.firestore.expectedChecksum,
      namePrefix: "cloud-firestore-emulator",
    },
  },
  storage: {
    downloadPath: path.join(
      CACHE_DIR,
      `cloud-storage-rules-runtime-v${EMULATOR_UPDATE_DETAILS.storage.version}.jar`,
    ),
    version: EMULATOR_UPDATE_DETAILS.storage.version,
    opts: {
      cacheDir: CACHE_DIR,
      remoteUrl: `https://storage.googleapis.com/firebase-preview-drop/emulator/cloud-storage-rules-runtime-v${EMULATOR_UPDATE_DETAILS.storage.version}.jar`,
      expectedSize: EMULATOR_UPDATE_DETAILS.storage.expectedSize,
      expectedChecksum: EMULATOR_UPDATE_DETAILS.storage.expectedChecksum,
      namePrefix: "cloud-storage-rules-emulator",
    },
  },
  ui: {
    version: EMULATOR_UPDATE_DETAILS.ui.version,
    downloadPath: path.join(CACHE_DIR, `ui-v${EMULATOR_UPDATE_DETAILS.ui.version}.zip`),
    unzipDir: path.join(CACHE_DIR, `ui-v${EMULATOR_UPDATE_DETAILS.ui.version}`),
    binaryPath: path.join(
      CACHE_DIR,
      `ui-v${EMULATOR_UPDATE_DETAILS.ui.version}`,
      "server",
      "server.mjs",
    ),
    opts: {
      cacheDir: CACHE_DIR,
      remoteUrl: `https://storage.googleapis.com/firebase-preview-drop/emulator/ui-v${EMULATOR_UPDATE_DETAILS.ui.version}.zip`,
      expectedSize: EMULATOR_UPDATE_DETAILS.ui.expectedSize,
      expectedChecksum: EMULATOR_UPDATE_DETAILS.ui.expectedChecksum,
      skipCache: experiments.isEnabled("emulatoruisnapshot"),
      skipChecksumAndSize: experiments.isEnabled("emulatoruisnapshot"),
      namePrefix: "ui",
    },
  },
  pubsub: {
    downloadPath: path.join(
      CACHE_DIR,
      `pubsub-emulator-${EMULATOR_UPDATE_DETAILS.pubsub.version}.zip`,
    ),
    version: EMULATOR_UPDATE_DETAILS.pubsub.version,
    unzipDir: path.join(CACHE_DIR, `pubsub-emulator-${EMULATOR_UPDATE_DETAILS.pubsub.version}`),
    binaryPath: path.join(
      CACHE_DIR,
      `pubsub-emulator-${EMULATOR_UPDATE_DETAILS.pubsub.version}`,
      `pubsub-emulator/bin/cloud-pubsub-emulator${process.platform === "win32" ? ".bat" : ""}`,
    ),
    opts: {
      cacheDir: CACHE_DIR,
      remoteUrl: `https://storage.googleapis.com/firebase-preview-drop/emulator/pubsub-emulator-${EMULATOR_UPDATE_DETAILS.pubsub.version}.zip`,
      expectedSize: EMULATOR_UPDATE_DETAILS.pubsub.expectedSize,
      expectedChecksum: EMULATOR_UPDATE_DETAILS.pubsub.expectedChecksum,
      namePrefix: "pubsub-emulator",
    },
  },
  // TODO: Add Windows binary here as well
  dataconnect: {
    downloadPath: path.join(
      CACHE_DIR,
      `dataconnect-emulator-${EMULATOR_UPDATE_DETAILS.dataconnect.version}`,
    ),
    version: EMULATOR_UPDATE_DETAILS.dataconnect.version,
    binaryPath: path.join(
      CACHE_DIR,
      `dataconnect-emulator-${EMULATOR_UPDATE_DETAILS.dataconnect.version}`,
    ),
    opts: {
      cacheDir: CACHE_DIR,
      remoteUrl:
        process.platform === "darwin"
          ? `https://storage.googleapis.com/firemat-preview-drop/emulator/dataconnect-emulator-macos-v${EMULATOR_UPDATE_DETAILS.dataconnect.version}`
          : `https://storage.googleapis.com/firemat-preview-drop/emulator/dataconnect-emulator-linux-v${EMULATOR_UPDATE_DETAILS.dataconnect.version}`,
      expectedSize: EMULATOR_UPDATE_DETAILS.dataconnect.expectedSize,
      expectedChecksum: EMULATOR_UPDATE_DETAILS.dataconnect.expectedChecksum,
      skipChecksumAndSize: false,
      namePrefix: "dataconnect-emulator",
      auth: true,
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
  dataconnect: {
    name: Emulators.DATACONNECT,
    instance: null,
    stdout: null,
  },
};

const Commands: { [s in DownloadableEmulators]: DownloadableEmulatorCommand } = {
  database: {
    binary: "java",
    args: ["-Duser.language=en", "-jar", getExecPath(Emulators.DATABASE)],
    optionalArgs: [
      "port",
      "host",
      "functions_emulator_port",
      "functions_emulator_host",
      "single_project_mode",
    ],
    joinArgs: false,
    shell: false,
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
      "websocket_port",
      "functions_emulator",
      "seed_from_export",
      "project_id",
      "single_project_mode",
      // TODO(christhompson) Re-enable after firestore accepts this flag.
      // "single_project_mode_error",
    ],
    joinArgs: false,
    shell: false,
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
    shell: false,
  },
  pubsub: {
    binary: getExecPath(Emulators.PUBSUB)!,
    args: [],
    optionalArgs: ["port", "host"],
    joinArgs: true,
    shell: true,
  },
  ui: {
    binary: "node",
    args: [getExecPath(Emulators.UI)],
    optionalArgs: [],
    joinArgs: false,
    shell: false,
  },
  dataconnect: {
    binary: getExecPath(Emulators.DATACONNECT),
    args: ["dev"],
    optionalArgs: ["http_port", "grpc_port", "config_dir", "local_connection_string", "project_id"],
    joinArgs: true,
    shell: true,
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
  args: { [s: string]: any },
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
    shell: baseCmd.shell,
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
      `Fatal error occurred: \n   ${errorMsg}, \n   stopping all running emulators`,
    );
    await EmulatorRegistry.stopAll();
  } finally {
    process.exit(1);
  }
}

/**
 * Handle errors in an emulator process.
 */
export async function handleEmulatorProcessError(emulator: Emulators, err: any): Promise<void> {
  const description = Constants.description(emulator);
  if (err.path === "java" && err.code === "ENOENT") {
    await _fatal(
      emulator,
      `${description} has exited because java is not installed, you can install it from https://openjdk.java.net/install/`,
    );
  } else {
    await _fatal(emulator, `${description} has exited: ${err}`);
  }
}

/**
 * Do the selected list of emulators depend on the JRE.
 */
export function requiresJava(emulator: Emulators): boolean {
  if (emulator in Commands) {
    return Commands[emulator as keyof typeof Commands].binary === "java";
  }
  return false;
}

async function _runBinary(
  emulator: DownloadableEmulatorDetails,
  command: DownloadableEmulatorCommand,
  extraEnv: Partial<NodeJS.ProcessEnv>,
): Promise<void> {
  return new Promise((resolve) => {
    const logger = EmulatorLogger.forEmulator(emulator.name);
    emulator.stdout = fs.createWriteStream(getLogFileName(emulator.name));
    try {
      const opts: childProcess.SpawnOptions = {
        env: { ...process.env, ...extraEnv },
        // `detached` must be true as else a SIGINT (Ctrl-c) will stop the child process before we can handle a
        // graceful shutdown and call `downloadableEmulators.stop(...)` ourselves.
        // Note that it seems to be a problem with gRPC processes for which a fix may be found on the Java side
        // related to this issue: https://github.com/grpc/grpc-java/pull/6512
        detached: true,
        stdio: ["inherit", "pipe", "pipe"],
      };
      if (command.shell && utils.IS_WINDOWS) {
        opts.shell = true;
      }
      emulator.instance = childProcess.spawn(command.binary, command.args, opts);
    } catch (e: any) {
      if (e.code === "EACCES") {
        // Known issue when WSL users don't have java
        // https://github.com/Microsoft/WSL/issues/3886
        logger.logLabeled(
          "WARN",
          emulator.name,
          `Could not spawn child process for emulator, check that java is installed and on your $PATH.`,
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
      `${description} logging to ${clc.bold(getLogFileName(emulator.name))}`,
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
          "Unsupported java version, make sure java --version reports 1.8 or higher.",
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

    // kill(0) does not end the process, it just checks for existence. See https://man7.org/linux/man-pages/man2/kill.2.html#:~:text=If%20sig%20is%200%2C%20
    if (emulator.instance && emulator.instance.kill(0)) {
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
export async function downloadIfNecessary(
  targetName: DownloadableEmulators,
): Promise<DownloadableEmulatorCommand> {
  const hasEmulator = fs.existsSync(getExecPath(targetName));

  if (!hasEmulator) {
    await downloadEmulator(targetName);
  }
  return Commands[targetName];
}

/**
 * @param targetName
 * @param args
 * @param extraEnv
 */
export async function start(
  targetName: DownloadableEmulators,
  args: {
    auto_download?: boolean;
    port?: number;
    host?: string;
    [k: string]: any;
  },
  extraEnv: Partial<NodeJS.ProcessEnv> = {},
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
            targetName,
          )} repeatedly by caching the ${downloadDetails.opts.cacheDir} directory.`,
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
    `Starting ${Constants.description(targetName)} with command ${JSON.stringify(command)}`,
  );
  return _runBinary(emulator, command, extraEnv);
}
