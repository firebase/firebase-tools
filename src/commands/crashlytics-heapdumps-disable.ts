import * as clc from "colorette";

import { Command } from "../command";
import { logger } from "../logger";
import { Options } from "../options";
import { needProjectId } from "../projectUtils";
import { requireAuth } from "../requireAuth";
import { disableHeapDumpCollection, resolveAndroidAppId } from "../crashlytics/profilingManager";

interface CommandOptions extends Options {
  app?: string;
}

export const command = new Command("crashlytics:heapdumps:disable")
  .description("disable Crashlytics heap dump collection for an Android app")
  .option("--app <appID>", "the app id of your Firebase Android app")
  .before(requireAuth)
  .action(async (options: CommandOptions) => {
    const projectId = needProjectId(options);
    const appId = await resolveAndroidAppId(projectId, options);

    await disableHeapDumpCollection(appId);

    logger.info("");
    logger.info(clc.bold("Heap Dump Collection Details:"));
    logger.info(`  App ID: ${clc.cyan(appId)}`);
    logger.info(`  Status: ${clc.red("Disabled")}`);

    return {
      appId,
      heapDumpCollectionEnabled: false,
    };
  });
