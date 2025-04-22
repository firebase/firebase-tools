import * as clc from "colorette";

import { Command } from "../command";
import { Options } from "../options";
import { DataConnectEmulator } from "../emulator/dataconnectEmulator";
import { needProjectId } from "../projectUtils";
import { load } from "../dataconnect/load";
import { readFirebaseJson } from "../dataconnect/fileUtils";
import { logger } from "../logger";
import { getProjectDefaultAccount } from "../auth";

type GenerateOptions = Options & { watch?: boolean };

export const command = new Command("dataconnect:sdk:generate")
  .description("generate typed SDKs for your Data Connect connectors")
  .option(
    "--watch",
    "watch for changes to your connector GQL files and regenerate your SDKs when updates occur",
  )
  .action(async (options: GenerateOptions) => {
    const projectId = needProjectId(options);

    const services = readFirebaseJson(options.config);
    for (const service of services) {
      const configDir = service.source;
      const serviceInfo = await load(projectId, options.config, configDir);
      const hasGeneratables = serviceInfo.connectorInfo.some((c) => {
        return (
          c.connectorYaml.generate?.javascriptSdk ||
          c.connectorYaml.generate?.kotlinSdk ||
          c.connectorYaml.generate?.swiftSdk ||
          c.connectorYaml.generate?.dartSdk
        );
      });
      if (!hasGeneratables) {
        logger.warn("No generated SDKs have been declared in connector.yaml files.");
        logger.warn(
          `Run ${clc.bold("firebase init dataconnect:sdk")} to configure a generated SDK.`,
        );
        logger.warn(
          `See https://firebase.google.com/docs/data-connect/web-sdk for more details of how to configure generated SDKs.`,
        );
        return;
      }
      for (const conn of serviceInfo.connectorInfo) {
        const account = getProjectDefaultAccount(options.projectRoot);
        const output = await DataConnectEmulator.generate({
          configDir,
          connectorId: conn.connectorYaml.connectorId,
          watch: options.watch,
          account,
        });
        logger.info(output);
        logger.info(`Generated SDKs for ${conn.connectorYaml.connectorId}`);
      }
    }
  });
