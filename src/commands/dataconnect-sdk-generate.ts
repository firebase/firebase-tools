import * as clc from "colorette";

import { Command } from "../command";
import { Options } from "../options";
import { DataConnectEmulator } from "../emulator/dataconnectEmulator";
import { needProjectId } from "../projectUtils";
import { loadAll } from "../dataconnect/load";
import { logger } from "../logger";
import { getProjectDefaultAccount } from "../auth";
import { logLabeledSuccess } from "../utils";
import { ServiceInfo } from "../dataconnect/types";
import { Config } from "../config";
import { Setup } from "../init";
import * as dataconnect from "../init/features/dataconnect";
import * as sdk from "../init/features/dataconnect/sdk";

type GenerateOptions = Options & { watch?: boolean };

export const command = new Command("dataconnect:sdk:generate")
  .description("generate typed SDKs for your Data Connect connectors")
  .option(
    "--watch",
    "watch for changes to your connector GQL files and regenerate your SDKs when updates occur",
  )
  .action(async (options: GenerateOptions) => {
    const projectId = needProjectId(options);

    let config = options.config;
    if (!config.has("dataconnect")) {
      const setup: Setup = {
        config: config.src,
        rcfile: options.rc.data,
        instructions: [],
      };
      const newConfig = new Config(
        {},
        {
          projectDir: config.projectDir,
          cwd: options.cwd,
        },
      );
      await dataconnect.askQuestions(setup);
      await dataconnect.actuate(setup, newConfig, options);
      // Config might have been updated, so we need to reload it.
      config = new Config(newConfig.src, {
        projectDir: config.projectDir,
        cwd: options.cwd,
      });
    }

    let serviceInfos = await loadAll(projectId, config);
    let serviceInfosWithSDKs = serviceInfos.filter((serviceInfo) =>
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
      logger.info("No generated SDKs have been declared in connector.yaml files.");
      logger.info(
        `Running ${clc.bold("firebase init dataconnect:sdk")} to configure a generated SDK.`,
      );
      const setup: Setup = {
        config: config.src,
        rcfile: options.rc.data,
        instructions: [],
      };
      await sdk.askQuestions(setup);
      await sdk.actuate(setup, config);
      serviceInfos = await loadAll(projectId, config);
      serviceInfosWithSDKs = serviceInfos.filter((serviceInfo) =>
        serviceInfo.connectorInfo.some((c) => {
          return (
            c.connectorYaml.generate?.javascriptSdk ||
            c.connectorYaml.generate?.kotlinSdk ||
            c.connectorYaml.generate?.swiftSdk ||
            c.connectorYaml.generate?.dartSdk
          );
        }),
      );
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
