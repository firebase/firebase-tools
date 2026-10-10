import * as clc from "colorette";
import * as Table from "cli-table3";

import { Command } from "../command";
import { logger } from "../logger";
import { Options } from "../options";
import { needProjectId } from "../projectUtils";
import { requireAuth } from "../requireAuth";
import { getProfilingManagerConfig, resolveAndroidAppId } from "../crashlytics/profilingManager";

interface CommandOptions extends Options {
  app?: string;
}

export const command = new Command("crashlytics:heapdumps:status")
  .description("get Crashlytics heap dump collection status and configuration for an Android app")
  .option("--app <appID>", "the app id of your Firebase Android app")
  .before(requireAuth)
  .action(async (options: CommandOptions) => {
    const projectId = needProjectId(options);
    const appId = await resolveAndroidAppId(projectId, options);

    const config = await getProfilingManagerConfig(appId);

    const tableHead = ["App ID", "Collection Status", "Cloud Storage Bucket"];
    const table = new Table({ head: tableHead, style: { head: ["green"] } });
    table.push([
      appId,
      config.heapDumpCollectionEnabled ? clc.green("Enabled") : clc.red("Disabled"),
      config.gcsBucket || clc.yellow("(none)"),
    ]);

    logger.info("");
    logger.info(table.toString());

    return {
      appId,
      ...config,
    };
  });
