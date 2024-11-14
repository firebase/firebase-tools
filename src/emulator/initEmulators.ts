// specific initialization steps for an emulator

import { promptOnce } from "../prompt";
import { detectStartCommand } from "./apphosting/utils";
import { EmulatorLogger } from "./emulatorLogger";
import { Emulators } from "./types";

type InitFn = () => Promise<Record<string, string> | null>;
type AdditionalInitFnsType = Partial<Record<Emulators, InitFn>>;

export const AdditionalInitFns: AdditionalInitFnsType = {
  [Emulators.APPHOSTING]: async () => {
    const additionalConfigs = new Map<string, string>();
    const logger = EmulatorLogger.forEmulator(Emulators.APPHOSTING);
    logger.log("BULLET", "Initializing App Hosting Emulator");

    // get root directory
    const rootDirectory = await promptOnce({
      name: "rootDir",
      type: "input",
      default: "./",
      message: "Specify your app's root directory relative to your repository",
    });
    additionalConfigs.set("rootDirectory", rootDirectory);

    // Auto-detect package manager and set startCommandOverride
    // TODO: don't use cwd, instead try to find project root
    const backendRoot = process.cwd();
    try {
      const startCommand = await detectStartCommand(backendRoot);
      additionalConfigs.set("startCommandOverride", startCommand);
    } catch (e) {
      logger.log(
        "WARN",
        "failed to auto-detect your project's start command, consider manually setting the start command by setting the startCommandOverride config",
      );
    }

    // prompt for apphosting yaml to export

    return mapToObject(additionalConfigs);
  },
};

function mapToObject(map: Map<string, string>): Record<string, string> {
  let newObject: Record<string, string> = {};
  for (let [key, value] of map) {
    newObject[key] = value;
  }
  return newObject;
}
