import * as clc from "cli-color";
import * as ora from "ora";

import * as Command from "../command";
import * as FirebaseError from "../error";
import {
  addFirebaseToCloudProject,
  createCloudProject,
  ParentResource,
  ParentResourceType,
} from "../projectsCreate";
import { prompt } from "../prompt";
import * as requireAuth from "../requireAuth";
import * as logger from "../logger";

async function createFirebaseProject(
  projectId: string,
  options: { displayName?: string; parentResource?: ParentResource }
): Promise<any> {
  let spinner = ora("Creating Google Cloud Platform project").start();
  try {
    await createCloudProject(projectId, options);
    spinner.succeed();

    spinner = ora("Adding Firebase to Google Cloud project").start();
    const projectInfo = await addFirebaseToCloudProject(projectId);
    spinner.succeed();

    logger.info("");
    logger.info("🎉🎉🎉 Your Firebase project is ready! 🎉🎉🎉");
    logger.info("");
    logger.info("Project information:");
    logger.info(`   - Project ID: ${clc.bold(projectInfo.projectId)}`);
    logger.info(`   - Project Name: ${clc.bold(projectInfo.displayName)}`);
    logger.info("");
    logger.info("Firebase console is available at");
    logger.info(`https://console.firebase.google.com/project/${clc.bold(projectId)}/overview`);
    return projectInfo;
  } catch (err) {
    spinner.fail();
    throw err;
  }
}

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
    async (projectId: string | undefined, options: any): Promise<any> => {
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
            name: "projectId",
            default: "",
            message:
              "Please specify a unique project id " +
              `(${clc.yellow("warning")}: cannot be modified afterward) [6-30 characters]:\n`,
          },
          {
            type: "input",
            name: "displayName",
            default: "",
            message: "What would you like to call your project? (default to your project id)",
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

      return createFirebaseProject(options.projectId, {
        displayName: options.displayName,
        parentResource,
      });
    }
  );
