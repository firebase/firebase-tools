import { Command } from "../command.js";
import { FirebaseError } from "../error.js";
import {
  addFirebaseToCloudProjectAndLog,
  FirebaseProjectMetadata,
  promptAvailableProjectId,
} from "../management/projects";
import { requireAuth } from "../requireAuth.js";

export const command = new Command("projects:addfirebase [projectId]")
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
