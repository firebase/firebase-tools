import * as clc from "colorette";
import * as ora from "ora";

import { Command } from "../command";
import { logger } from "../logger";
import { Options } from "../options";
import { needProjectId } from "../projectUtils";
import { confirm } from "../prompt";
import { requireAuth } from "../requireAuth";
import {
  getProfilingManagerConfig,
  resolveAndroidAppId,
  updateProfilingManagerConfig,
} from "../crashlytics/profilingManager";

interface CommandOptions extends Options {
  app?: string;
}

export const command = new Command("crashlytics:heapdumps:disable")
  .description("disable Crashlytics heap dump collection for an Android app")
  .option("--app <appID>", "the app id of your Firebase Android app")
  .option("--force", "automatically disable without prompting for confirmation")
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

    const spinner = ora("Disabling Crashlytics heap dump collection...").start();
    try {
      const currentConfig = await getProfilingManagerConfig(appId);
      await updateProfilingManagerConfig(appId, {
        gcsBucket: currentConfig.gcsBucket,
        heapDumpCollectionEnabled: false,
      });
      spinner.succeed("Successfully disabled Crashlytics heap dump collection!");
    } catch (err: unknown) {
      spinner.fail("Failed to disable Crashlytics heap dump collection.");
      throw err;
    }

    logger.info("");
    logger.info(clc.bold("Heap Dump Collection Details:"));
    logger.info(`  App ID: ${clc.cyan(appId)}`);
    logger.info(`  Status: ${clc.red("Disabled")}`);

    return {
      appId,
      heapDumpCollectionEnabled: false,
    };
  });
