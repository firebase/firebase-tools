import * as clc from "cli-color";

import { Command } from "../command.js";
import { needProjectId } from "../projectUtils.js";
import { deleteAppAndroidSha } from "../management/apps.js";
import { requireAuth } from "../requireAuth.js";
import { promiseWithSpinner } from "../utils.js";

export const command = new Command("apps:android:sha:delete <appId> <shaId>")
  .description("delete a SHA certificate hash for a given app id.")
  .before(requireAuth)
  .action(async (appId: string = "", shaId: string = "", options: any): Promise<void> => {
    const projectId = needProjectId(options);

    await promiseWithSpinner<void>(
      async () => await deleteAppAndroidSha(projectId, appId, shaId),
      `Deleting Android SHA certificate hash with SHA id ${clc.bold(
        shaId
      )} and Android app Id ${clc.bold(appId)}`
    );
  });
