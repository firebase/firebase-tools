import * as clc from "colorette";

import { Command } from "../command";
import { Options } from "../options";
import { DataConnectEmulator } from "../emulator/dataconnectEmulator";
import { needProjectId } from "../projectUtils";
import { pickServices } from "../dataconnect/load";
import { logger } from "../logger";
import { getProjectDefaultAccount } from "../auth";
import { logLabeledSuccess } from "../utils";
import { ServiceInfo } from "../dataconnect/types";

type GenerateOptions = Options & { watch?: boolean; service?: string; location?: string };

export const command = new Command("dataconnect:sdk:generate")
  .description("generate typed SDKs to use Data Connect in your apps")
  .option(
    "--service <serviceId>",
    "the serviceId of the Data Connect service. If not provided, generates SDKs for all services.",
  )
  .option("--location <location>", "the location of the Data Connect service to disambiguate")
  .option(
    "--watch",
    "watch for changes to your connector GQL files and regenerate your SDKs when updates occur",
  )
  .action(async (options: GenerateOptions) => {
    const projectId = needProjectId(options);
    const serviceInfos = await pickServices(projectId, options.config, options.service, options.location);
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
    async function generateSDK(serviceInfo: ServiceInfo): Promise<void> {
      return DataConnectEmulator.generate({
        configDir: serviceInfo.sourceDirectory,
        watch: options.watch,
        account: getProjectDefaultAccount(options.projectRoot),
      });
    }
    if (options.watch) {
      await Promise.race(serviceInfosWithSDKs.map(generateSDK));
    } else {
      for (const s of serviceInfosWithSDKs) {
        await generateSDK(s);
      }
      const services = serviceInfosWithSDKs.map((s) => s.dataConnectYaml.serviceId).join(", ");
      logLabeledSuccess(
        "dataconnect",
        `Successfully Generated SDKs for services: ${clc.bold(services)}`,
      );
    }
  });
