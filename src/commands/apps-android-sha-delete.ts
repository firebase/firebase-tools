import * as clc from "cli-color";
import * as ora from "ora";

import { Command } from "../command";
import * as getProjectId from "../getProjectId";
import { deleteAppAndroidSha } from "../management/apps";
import { requireAuth } from "../requireAuth";
import * as logger from "../logger";

async function initiateAppAndroidShaDeletion(
  projectId: string,
  appId: string,
  shaId: string
): Promise<void> {
  const spinner = ora("Deleting Android SHA certificate hash").start();

  try {
    await deleteAppAndroidSha(projectId, appId, shaId);
    spinner.succeed();
  } catch (err) {
    spinner.fail();
    throw err;
  }
}

module.exports = new Command("apps:android:sha:delete <appId> <shaId>")
  .description("delete a SHA certificate hash for a given app id.")
  .before(requireAuth)
  .action(
    async (appId: string = "", shaId: string = "", options: any): Promise<void> => {
      const projectId = getProjectId(options);

      logger.info(
        `Delete your SHA certificate hash with SHA id ${clc.bold(
          shaId
        )} with Android app Id ${clc.bold(appId)}:`
      );

      await initiateAppAndroidShaDeletion(projectId, appId, shaId);
    }
  );
