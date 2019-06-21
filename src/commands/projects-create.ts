import * as clc from "cli-color";
import * as Command from "../command";
import * as FirebaseError from "../error";
import { createFirebaseProject, ParentResourceType } from "../firebase-resource-manager";
import { prompt } from "../prompt";
import * as requireAuth from "../requireAuth";
import logger = require("../logger");

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
  .action(async (projectId: string, options: any) => {
    options.projectId = projectId; // add projectId into options to pass into prompt function

    if (options.organization && options.folder) {
      throw new FirebaseError(
        "Invalid argument, please provide only one type of project parent (organization or folder)"
      );
    }
    if (!options.nonInteractive) {
      await prompt(options, [
        {
          type: "input",
          name: "displayName",
          default: "",
          message: "What would you like to call your project? (Press enter to skip)",
        },
        {
          type: "input",
          name: "projectId",
          default: "",
          message:
            "Please specify a unique project id " +
            `(${clc.red("warning")}: cannot modify after project creation) [6-30 characters]:\n`,
        },
      ]);
    }
    if (!options.projectId) {
      const message = options.nonInteractive
        ? "Cannot run projects:create without project ID specified in non-interactive mode"
        : "Project ID cannot be empty";
      throw new FirebaseError(message);
    }

    projectId = options.projectId;
    const { displayName, organization, folder } = options;
    let parentResource;
    if (organization) {
      parentResource = { type: ParentResourceType.ORGANIZATION, id: organization };
    } else if (folder) {
      parentResource = { type: ParentResourceType.FOLDER, id: folder };
    }

    return createFirebaseProject(projectId, displayName, parentResource);
  });
