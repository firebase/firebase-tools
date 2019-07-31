import * as ora from "ora";
import * as _ from "lodash";

import * as Command from "../command";
import { FirebaseError } from "../error";
import {
  addFirebaseToCloudProject,
  logNewFirebaseProjectInfo,
  promptAvailableProjectId,
} from "../management/projects";
import * as requireAuth from "../requireAuth";

module.exports = new Command("projects:addfirebase [projectId]")
  .description("add Firebase resources to a Google Cloud Platform project")
  .before(requireAuth)
  .action(
    async (projectId: string | undefined, options: any): Promise<any> => {
      if (!options.nonInteractive && !projectId) {
        projectId = await promptAvailableProjectId();
      }

      if (!projectId) {
        throw new FirebaseError("Project ID cannot be empty");
      }

      const spinner = ora("Adding Firebase to your Google Cloud Platform project").start();

      let projectInfo;
      try {
        projectInfo = await addFirebaseToCloudProject(projectId);
      } catch (err) {
        spinner.fail();
        throw err;
      }

      spinner.succeed();
      logNewFirebaseProjectInfo(projectInfo);
      return projectInfo;
    }
  );
