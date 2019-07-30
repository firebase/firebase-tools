import * as ora from "ora";
import * as _ from "lodash";

import * as Command from "../command";
import { FirebaseError } from "../error";
import {
  addFirebaseToCloudProject,
  CloudProjectInfo,
  getAvailableCloudProjectPage,
  logNewFirebaseProjectInfo,
} from "../management/projects";
import { promptOnce } from "../prompt";
import * as requireAuth from "../requireAuth";

const MAXIMUM_PROMPT_LIST = 100;

function getProjectId(cloudProject: CloudProjectInfo): string {
  const resourceName = cloudProject.project;
  // According to
  // https://firebase.google.com/docs/projects/api/reference/rest/v1beta1/availableProjects/list#projectinfo,
  // resource name has the format of "projects/projectId"
  return resourceName.substring(resourceName.lastIndexOf("/") + 1);
}

async function promptAvailableCloudProjectId(): Promise<string> {
  const { projects, nextPageToken } = await getAvailableCloudProjectPage(MAXIMUM_PROMPT_LIST);
  if (projects.length === 0) {
    throw new FirebaseError(
      "There are no available Google Cloud projects to add Firebase services."
    );
  }

  if (nextPageToken) {
    // Prompt for project ID if we can't list all projects in 1 page
    return await promptOnce({
      type: "input",
      message: "Please input the ID of the Google Cloud Project you would like to add Firebase:",
    });
  } else {
    let choices = projects.filter((p: CloudProjectInfo) => !!p).map((p) => {
      const projectId = getProjectId(p);
      return {
        name: projectId + (p.displayName ? ` (${p.displayName})` : ""),
        value: projectId,
      };
    });
    choices = _.orderBy(choices, ["name"], ["asc"]);
    return await promptOnce({
      type: "list",
      name: "id",
      message: "Select the Google Cloud Platform project you would like to add Firebase:",
      choices,
    });
  }
}

module.exports = new Command("projects:addfirebase [projectId]")
  .description("add Firebase resources to a Google Cloud Platform project")
  .before(requireAuth)
  .action(
    async (projectId: string | undefined, options: any): Promise<any> => {
      if (!options.nonInteractive && !projectId) {
        projectId = await promptAvailableCloudProjectId();
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
