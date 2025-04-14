// specific initialization steps for an emulator

import * as clc from "colorette";
import { join } from "path";
import { promptOnce } from "../prompt";
import { detectStartCommand } from "./apphosting/developmentServer";
import { EmulatorLogger } from "./emulatorLogger";
import { Emulators } from "./types";
import { Env, maybeGenerateEmulatorYaml } from "../apphosting/config";
import { detectProjectRoot } from "../detectProjectRoot";
import { Config } from "../config";
import { getProjectId } from "../projectUtils";
import { grantEmailsSecretAccess } from "../apphosting/secrets";

type InitFn = (config: Config) => Promise<Record<string, string> | null>;
type AdditionalInitFnsType = Partial<Record<Emulators, InitFn>>;

export const AdditionalInitFns: AdditionalInitFnsType = {
  [Emulators.APPHOSTING]: async (config: Config) => {
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

    const projectId = getProjectId(config.options);
    let env: Env[] | null = [];
    try {
      const projectRoot = detectProjectRoot({ cwd: config.options.cwd }) ?? backendRoot;
      env = await maybeGenerateEmulatorYaml(projectId, projectRoot);
    } catch (e) {
      logger.log("WARN", "failed to export app hosting configs");
    }

    const secretIds = env?.filter((e) => "secret" in e)?.map((e) => e.secret) as string[] | null;
    if (secretIds?.length) {
      if (!projectId) {
        logger.log(
          "WARN",
          "Cannot grant developers access to secrets for local development without knowing what project the secret is in. " +
            `Run ${clc.bold(`firebase apphosting:secrets:grantaccess ${secretIds.join(",")} --project [project] --emails [email list]`)}`,
        );
      } else {
        const users = await promptOnce({
          type: "input",
          message:
            "Your config has secret values. Please provide a comma-separated list of users or groups who should have access to secrets for local development:",
        });
        if (users.length) {
          await grantEmailsSecretAccess(
            projectId,
            secretIds,
            users.split(",").map((u) => u.trim()),
          );
        } else {
          logger.log(
            "INFO",
            "Skipping granting developers access to secrets for local development. To grant access in the future, run " +
              `Run ${clc.bold(`firebase apphosting:secrets:grantaccess ${secretIds.join(",")} --emails [email list]`)}`,
          );
        }
      }
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
