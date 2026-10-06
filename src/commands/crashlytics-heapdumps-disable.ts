import * as clc from "colorette";

import { Command } from "../command";
import { logger } from "../logger";
import { Options } from "../options";
import { needProjectId } from "../projectUtils";
import { confirm } from "../prompt";
import { requireAuth } from "../requireAuth";
import { disableHeapDumpCollection, resolveAndroidAppId } from "../crashlytics/profilingManager";

interface CommandOptions extends Options {
  app?: string;
}

export const command = new Command("crashlytics:heapdumps:disable")
  .description("disable Crashlytics heap dump collection for an Android app")
  .option("--app <appID>", "the app id of your Firebase Android app")
  .withForce("automatically disable without prompting for confirmation")
  .before(requireAuth)
  .action(async (options: CommandOptions) => {
    const projectId = needProjectId(options);
    const appId = await resolveAndroidAppId(projectId, options);

    const confirmed = await confirm({
      message: `Disable Crashlytics heap dump collection for ${appId}?`,
      default: true,
      force: options.force,
      nonInteractive: options.nonInteractive,
    });

    if (!confirmed) {
      logger.info("Heap dump collection disablement canceled.");
      return;
    }

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
