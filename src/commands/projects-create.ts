import * as Command from "../command";
import { FirebaseError } from "../error";
import {
  createFirebaseProjectAndLog,
  FirebaseProjectMetadata,
  ProjectParentResourceType,
  PROJECTS_CREATE_QUESTIONS,
} from "../management/projects";
import { prompt } from "../prompt";
import * as requireAuth from "../requireAuth";

module.exports = new Command("projects:create [projectId]")
  .description("create a new firebase project")
  .option("-n, --display-name <displayName>", "(optional) display name for the project")
  .option(
    "-o, --organization <organizationId>",
    "(optional) ID of the parent Google Cloud Platform organization under which to create this project"
  )
  .option(
    "-f, --folder <folderId>",
    "(optional) ID of the parent Google Cloud Platform folder in which to create this project"
  )
  .before(requireAuth)
  .action(
    async (projectId: string | undefined, options: any): Promise<FirebaseProjectMetadata> => {
      options.projectId = projectId; // add projectId into options to pass into prompt function

      if (options.organization && options.folder) {
        throw new FirebaseError(
          "Invalid argument, please provide only one type of project parent (organization or folder)"
        );
      }
      if (!options.nonInteractive) {
        await prompt(options, PROJECTS_CREATE_QUESTIONS);
      }
      if (!options.projectId) {
        throw new FirebaseError("Project ID cannot be empty");
      }

      let parentResource;
      if (options.organization) {
        parentResource = { type: ProjectParentResourceType.ORGANIZATION, id: options.organization };
      } else if (options.folder) {
        parentResource = { type: ProjectParentResourceType.FOLDER, id: options.folder };
      }

      return createFirebaseProjectAndLog(options.projectId, {
        displayName: options.displayName,
        parentResource,
      });
    }
  );
