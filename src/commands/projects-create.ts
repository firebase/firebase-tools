import * as Command from "../command";
import * as FirebaseError from "../error";
import { FirebaseResourceManager, ParentResourceType } from "../firebase-resource-manager";
import * as requireAuth from "../requireAuth";

module.exports = new Command("projects:create [projectId]")
  .description("create a new firebase project")
  .option("-n, --name <projectName>", "(optional) display name for the project")
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
    (projectId: string, options: { name?: string; organization?: string; folder?: string }) => {
      const { name, organization, folder } = options;
      const projectDisplayName = name ? name : projectId;
      let parentResource;
      if (organization && folder) {
        throw new FirebaseError(
          "Invalid argument, please provide only one type of project parent (organization or folder)"
        );
      }

      if (organization) {
        parentResource = { type: ParentResourceType.ORGANIZATION, id: organization };
      } else if (folder) {
        parentResource = { type: ParentResourceType.FOLDER, id: folder };
      }

      return new FirebaseResourceManager().createFirebaseProject(
        projectId,
        projectDisplayName,
        parentResource
      );
    }
  );
