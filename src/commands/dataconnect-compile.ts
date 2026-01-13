import * as clc from "colorette";

import { Command } from "../command";
import { Options } from "../options";
import { DataConnectEmulator } from "../emulator/dataconnectEmulator";
import { getProjectId } from "../projectUtils";
import { pickServices } from "../dataconnect/load";
import { getProjectDefaultAccount } from "../auth";
import { logLabeledSuccess } from "../utils";
import { Config } from "../config";
import { EmulatorHub } from "../emulator/hub";
import { handleBuildErrors } from "../dataconnect/build";
import { FirebaseError } from "../error";

type CompileOptions = Options & { service?: string; location?: string };

export const command = new Command("dataconnect:compile")
  .description("compile your Data Connect schema and connector config and GQL files.")
  .option(
    "--service <serviceId>",
    "the serviceId of the Data Connect service. If not provided, compiles all services.",
  )
  .option(
    "--location <location>",
    "the location of the Data Connect service. Only needed if service ID is used in multiple locations.",
  )
  .action(async (options: CompileOptions) => {
    const projectId = getProjectId(options);

    const config = options.config;
    if (!config || !config.has("dataconnect")) {
      throw new FirebaseError(
        `No Data Connect project directory found. Please run ${clc.bold("firebase init dataconnect")} to set it up first.`,
      );
    }

    const serviceInfos = await pickServices(
      projectId || EmulatorHub.MISSING_PROJECT_PLACEHOLDER,
      config,
      options.service,
      options.location,
    );

    if (!serviceInfos.length) {
      throw new FirebaseError("No Data Connect services found to compile.");
    }

    for (const serviceInfo of serviceInfos) {
      const configDir = serviceInfo.sourceDirectory;
      const account = getProjectDefaultAccount(options.projectRoot);

      // 1. Build (Validate Schema/Connectors + Generate .dataconnect)
      const buildArgs = {
        configDir,
        projectId, // Optional, passes to fdc build --project_id if present
        account,
      };

      const buildResult = await DataConnectEmulator.build(buildArgs);

      if (buildResult?.errors?.length) {
        await handleBuildErrors(
          buildResult.errors,
          options.nonInteractive,
          options.force,
          !!options.dryRun,
        );
      }

      // 2. Generate SDKs
      // api-proposal says: "Generates or updates the local .dataconnect/ metadata folder and generated SDKs"
      await DataConnectEmulator.generate({
        configDir,
        account,
      });

      logLabeledSuccess(
        "dataconnect",
        `Successfully compiled Data Connect service: ${clc.bold(serviceInfo.dataConnectYaml.serviceId)}`,
      );
    }
  });
