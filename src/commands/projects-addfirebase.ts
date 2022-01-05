import { Command } from "../command";
import { FirebaseError } from "../error";
import {
  addFirebaseToCloudProjectAndLog,
  FirebaseProjectMetadata,
  promptAvailableProjectId,
} from "../management/projects";
import { requireAuth } from "../requireAuth";

module.exports = new Command("projects:addfirebase [projectId]")
  .description("add Firebase resources to a Google Cloud Platform project")
  .before(requireAuth)
  .action(async (projectId: string | undefined, options: any): Promise<FirebaseProjectMetadata> => {
    if (!options.nonInteractive && !projectId) {
      projectId = await promptAvailableProjectId();
    }

    if (!projectId) {
      throw new FirebaseError("Project ID cannot be empty");
    }

    return addFirebaseToCloudProjectAndLog(projectId);
  });
