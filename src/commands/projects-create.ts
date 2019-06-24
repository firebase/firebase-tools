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
      throw new FirebaseError("Project ID cannot be empty");
    }

    let parentResource;
    if (options.organization) {
      parentResource = { type: ParentResourceType.ORGANIZATION, id: options.organization };
    } else if (options.folder) {
      parentResource = { type: ParentResourceType.FOLDER, id: options.folder };
    }

    return createFirebaseProject(options.projectId, options.displayName, parentResource);
  });
