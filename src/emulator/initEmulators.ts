// specific initialization steps for an emulator

import { join } from "path";
import { promptOnce } from "../prompt";
import { detectStartCommand } from "./apphosting/developmentServer";
import { EmulatorLogger } from "./emulatorLogger";
import { Emulators } from "./types";
import { exportConfig } from "../apphosting/config";
import { detectProjectRoot } from "../detectProjectRoot";
import { Config } from "../config";

type InitFn = (config: Config) => Promise<Record<string, string> | null>;
type AdditionalInitFnsType = Partial<Record<Emulators, InitFn>>;

export const AdditionalInitFns: AdditionalInitFnsType = {
  [Emulators.APPHOSTING]: async () => {
    const cwd = process.cwd();
    const additionalConfigs = new Map<string, string>();
    const logger = EmulatorLogger.forEmulator(Emulators.APPHOSTING);
    logger.logLabeled("INFO", "Initializing Emulator");

    const backendRelativeDir = await promptOnce({
      name: "rootDir",
      type: "input",
      default: "./",
      message: "Specify your app's root directory relative to your repository",
    });
    additionalConfigs.set("rootDirectory", backendRelativeDir);

    const backendRoot = join(cwd, backendRelativeDir);
    try {
      const startCommand = await detectStartCommand(backendRoot);
      additionalConfigs.set("startCommand", startCommand);
    } catch (e) {
      logger.log(
        "WARN",
        "Failed to auto-detect your project's start command. Consider manually setting the start command by setting `firebase.json#emulators.apphosting.startCommand`",
      );
    }

    try {
      const projectRoot = detectProjectRoot({}) ?? backendRoot;
      await exportConfig(cwd, projectRoot, backendRoot);
    } catch (e) {
      logger.log("WARN", "failed to export app hosting configs");
    }

    return mapToObject(additionalConfigs);
  },
  [Emulators.DATACONNECT]: async (config: Config) => {
    const additionalConfig: Record<string, string> = {};
    const defaultDataConnectDir = config.get("dataconnect.source", "dataconnect");
    const defaultDataDir = config.get(
      "emulators.dataconnect.dataDir",
      `${defaultDataConnectDir}/.dataconnect/pgliteData`,
    );
    if (
      await promptOnce({
        name: "dataDir",
        type: "confirm",
        message:
          "Do you want to persist Postgres data from the Data Connect emulator between runs? " +
          `Data will be saved to ${defaultDataDir}. ` +
          `You can change this directory by editing 'firebase.json#emulators.dataconnect.dataDir'.`,
      })
    ) {
      additionalConfig["dataDir"] = defaultDataDir;
    }
    return additionalConfig;
  },
};

function mapToObject(map: Map<string, string>): Record<string, string> {
  const newObject: Record<string, string> = {};
  for (const [key, value] of map) {
    newObject[key] = value;
  }
  return newObject;
}
