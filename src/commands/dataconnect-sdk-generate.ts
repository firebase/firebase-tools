import * as clc from "colorette";

import { Command } from "../command";
import { Options } from "../options";
import { DataConnectEmulator } from "../emulator/dataconnectEmulator";
import { needProjectId } from "../projectUtils";
import { loadAll } from "../dataconnect/load";
import { getProjectDefaultAccount } from "../auth";
import { logBullet, logLabeledSuccess, logWarning } from "../utils";
import { ServiceInfo } from "../dataconnect/types";
import { Config } from "../config";
import { Setup } from "../init";
import * as dataconnectInit from "../init/features/dataconnect";
import * as dataconnectSdkInit from "../init/features/dataconnect/sdk";
import { FirebaseError } from "../error";
import { postInitSaves } from "./init";

type GenerateOptions = Options & { watch?: boolean };

export const command = new Command("dataconnect:sdk:generate")
  .description("generate typed SDKs for your Data Connect connectors")
  .option(
    "--watch",
    "watch for changes to your connector GQL files and regenerate your SDKs when updates occur",
  )
  .action(async (options: GenerateOptions) => {
    const projectId = needProjectId(options);

    let justRanInit = false;
    let config = options.config;
    if (!config || !config.has("dataconnect")) {
      if (options.nonInteractive) {
        throw new FirebaseError(
          `No dataconnect project directory found. Please run ${clc.bold("firebase init dataconnect")} to set it up first.`,
        );
      }
      logWarning("No dataconnect project directory found.");
      logBullet(
        `Running ${clc.bold("firebase init dataconnect")} to setup a dataconnect project directory.`,
      );
      if (!config) {
        const cwd = options.cwd || process.cwd();
        config = new Config({}, { projectDir: cwd, cwd: cwd });
      }
      const setup: Setup = {
        config: config.src,
        rcfile: options.rc.data,
        instructions: [],
      };
      await dataconnectInit.askQuestions(setup);
      setup.featureInfo!.dataconnect!.source = "gen_sdk_init";
      await dataconnectInit.actuate(setup, config, options);
      await postInitSaves(setup, config);
      justRanInit = true;
      options.config = config;
    }

    let serviceInfosWithSDKs = await loadAllWithSDKs(projectId, config);
    if (!serviceInfosWithSDKs.length) {
      if (justRanInit || options.nonInteractive) {
        throw new FirebaseError(
          `No generated SDKs are configured during init. Please run ${clc.bold("firebase init dataconnect:sdk")} to configure a generated SDK.`,
        );
      }
      logWarning("No generated SDKs have been configured.");
      logBullet(
        `Running ${clc.bold("firebase init dataconnect:sdk")} to configure a generated SDK.`,
      );
      const setup: Setup = {
        config: config.src,
        rcfile: options.rc.data,
        instructions: [],
      };
      await dataconnectSdkInit.askQuestions(setup);
      setup.featureInfo!.dataconnect!.source = "gen_sdk_init_sdk";
      await dataconnectSdkInit.actuate(setup, config);
      justRanInit = true;
      serviceInfosWithSDKs = await loadAllWithSDKs(projectId, config);
    }

    await generateSDKsInAll(options, serviceInfosWithSDKs, justRanInit);
  });

async function loadAllWithSDKs(projectId: string, config: Config): Promise<ServiceInfo[]> {
  const serviceInfos = await loadAll(projectId, config);
  return serviceInfos.filter((serviceInfo) =>
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

async function generateSDKsInAll(
  options: GenerateOptions,
  serviceInfosWithSDKs: ServiceInfo[],
  justRanInit: boolean,
): Promise<void> {
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
    if (justRanInit) {
      return; // SDKs are already generated during init
    }
    for (const s of serviceInfosWithSDKs) {
      await generateSDK(s);
    }
    const services = serviceInfosWithSDKs.map((s) => s.dataConnectYaml.serviceId).join(", ");
    logLabeledSuccess(
      "dataconnect",
      `Successfully Generated SDKs for services: ${clc.bold(services)}`,
    );
  }
}
