// specific initialization steps for an emulator

import { join } from "path";
import { promptOnce } from "../prompt";
import { detectStartCommand } from "./apphosting/developmentServer";
import { EmulatorLogger } from "./emulatorLogger";
import { Emulators } from "./types";
import { getOrPromptProject } from "../management/projects";
import { exportConfig } from "../apphosting/config";

type InitFn = () => Promise<Record<string, string> | null>;
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
      additionalConfigs.set("startCommandOverride", startCommand);
    } catch (e) {
      logger.log(
        "WARN",
        "Failed to auto-detect your project's start command. Consider manually setting the start command by setting `firebase.json#emulators.apphosting.startCommandOverride`",
      );
    }

    try {
      // prompt for apphosting yaml to export
      const project = await getOrPromptProject({});
      await exportConfig(project.projectId, cwd, backendRoot);
    } catch (e) {
      logger.log("WARN", "failed to export app hosting configs");
    }

    return mapToObject(additionalConfigs);
  },
};

function mapToObject(map: Map<string, string>): Record<string, string> {
  const newObject: Record<string, string> = {};
  for (const [key, value] of map) {
    newObject[key] = value;
  }
  return newObject;
}
