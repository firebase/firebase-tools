import * as clc from "cli-color";

import { Command } from "../command";
import * as getProjectId from "../getProjectId";
import { deleteAppAndroidSha } from "../management/apps";
import { requireAuth } from "../requireAuth";
import { promiseWithSpinner } from "../utils";

module.exports = new Command("apps:android:sha:delete <appId> <shaId>")
  .description("delete a SHA certificate hash for a given app id.")
  .before(requireAuth)
  .action(
    async (appId: string = "", shaId: string = "", options: any): Promise<void> => {
      const projectId = getProjectId(options);

      await promiseWithSpinner<void>(
        async () => await deleteAppAndroidSha(projectId, appId, shaId),
        `Deleting Android SHA certificate hash with SHA id ${clc.bold(
          shaId
        )} and Android app Id ${clc.bold(appId)}`
      );
    }
  );
