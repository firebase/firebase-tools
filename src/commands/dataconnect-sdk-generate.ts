import * as clc from "colorette";

import { Command } from "../command";
import { Options } from "../options";
import { DataConnectEmulator } from "../emulator/dataconnectEmulator";
import { needProjectId } from "../projectUtils";
import { loadAll } from "../dataconnect/load";
import { logger } from "../logger";
import { getProjectDefaultAccount } from "../auth";
import { logLabeledSuccess } from "../utils";

type GenerateOptions = Options & { watch?: boolean };

export const command = new Command("dataconnect:sdk:generate")
  .description("generate typed SDKs for your Data Connect connectors")
  .option(
    "--watch",
    "watch for changes to your connector GQL files and regenerate your SDKs when updates occur",
  )
  .action(async (options: GenerateOptions) => {
    const projectId = needProjectId(options);

    const serviceInfos = await loadAll(projectId, options.config);
    const serviceInfosWithSDKs = serviceInfos.filter((serviceInfo) =>
      serviceInfo.connectorInfo.some((c) => {
        return (
          c.connectorYaml.generate?.javascriptSdk ||
          c.connectorYaml.generate?.kotlinSdk ||
          c.connectorYaml.generate?.swiftSdk ||
          c.connectorYaml.generate?.dartSdk
        );
      }),
    );
    if (!serviceInfosWithSDKs.length) {
      logger.warn("No generated SDKs have been declared in connector.yaml files.");
      logger.warn(`Run ${clc.bold("firebase init dataconnect:sdk")} to configure a generated SDK.`);
      logger.warn(
        `See https://firebase.google.com/docs/data-connect/web-sdk for more details of how to configure generated SDKs.`,
      );
      return;
    }
    const generateRuns = serviceInfosWithSDKs.map((serviceInfo) => {
      const configDir = serviceInfo.sourceDirectory;
      const account = getProjectDefaultAccount(options.projectRoot);
      return DataConnectEmulator.generate({
        configDir,
        watch: options.watch,
        account,
      });
    });

    if (options.watch) {
      await Promise.race(generateRuns);
    } else {
      await Promise.all(generateRuns);
      logLabeledSuccess("dataconnect", `Successfully Generated SDKs`);
    }
  });
