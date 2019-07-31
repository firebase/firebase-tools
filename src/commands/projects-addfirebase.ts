import * as _ from "lodash";

import * as Command from "../command";
import { FirebaseError } from "../error";
import { addFirebaseToCloudProjectAndLog, promptAvailableProjectId } from "../management/projects";
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

      return addFirebaseToCloudProjectAndLog(projectId);
    }
  );
