import * as clc from "cli-color";
import * as _ from "lodash";

import * as Config from "../../config";
import * as FirebaseError from "../../error";
import {
  FirebaseProjectMetadata,
  getFirebaseProject,
  getProjectPage,
} from "../../management/projects";
import * as logger from "../../logger";
import { promptOnce } from "../../prompt";
import * as utils from "../../utils";

const MAXIMUM_PROMPT_LIST = 100;
const OPTION_NO_PROJECT = "Don't set up a default project";
const OPTION_USE_PROJECT = "Use an existing project";
const OPTION_NEW_PROJECT = "Create a new project";

/**
 * Used in init flows to keep information about the project - basically
 * a shorter version of {@link FirebaseProjectMetadata} with some additional fields.
 */
export interface ProjectInfo {
  id: string; // maps to FirebaseProjectMetadata.projectId
  label?: string;
  instance?: string; // maps to FirebaseProjectMetadata.resources.realtimeDatabaseInstance
  location?: string; // maps to FirebaseProjectMetadata.resources.locationId
}

/**
 * Get the user's desired project, prompting if necessary.
 * @returns A {@link ProjectInfo} object.
 */
export async function getProjectInfo(options: any): Promise<ProjectInfo> {
  if (options.project) {
    return toProjectInfo(await getFirebaseProject(options.project));
  }
  return selectProjectInteractively();
}

async function selectProjectInteractively(
  pageSize: number = MAXIMUM_PROMPT_LIST
): Promise<ProjectInfo> {
  const { projects, nextPageToken } = await getProjectPage(pageSize);
  if (projects.length === 0) {
    throw new FirebaseError("There is no Firebase project associated with this account.");
  }
  if (nextPageToken) {
    // Prompt user for project ID if we can't list all projects in 1 page
    return selectProjectByPrompting();
  }
  return selectProjectFromList(projects);
}

async function selectProjectByPrompting(): Promise<ProjectInfo> {
  const projectId = await promptOnce({
    type: "input",
    message: "Please input the project ID you would like to use:",
  });

  return toProjectInfo(await getFirebaseProject(projectId));
}

/**
 * Presents user with list of projects to choose from and gets project information for chosen project.
 */
async function selectProjectFromList(
  projects: FirebaseProjectMetadata[] = []
): Promise<ProjectInfo> {
  let choices = projects.filter((p: FirebaseProjectMetadata) => !!p).map((p) => {
    return {
      name: p.projectId + (p.displayName ? ` (${p.displayName})` : ""),
      value: p.projectId,
    };
  });
  choices = _.orderBy(choices, ["name"], ["asc"]);

  if (choices.length >= 25) {
    utils.logBullet(
      `Don't want to scroll through all your projects? If you know your project ID, ` +
        `you can initialize it directly using ${clc.bold(
          "firebase init --project <project_id>"
        )}.\n`
    );
  }
  const projectId: string = await promptOnce({
    type: "list",
    name: "id",
    message: "Select a default Firebase project for this directory:",
    choices,
  });

  let project: FirebaseProjectMetadata | undefined;
  project = projects.find((p) => p.projectId === projectId);

  if (!project) {
    throw new FirebaseError("Unexpected error. Chosen project must exist");
  }

  return toProjectInfo(project);
}

function toProjectInfo(projectMetaData: FirebaseProjectMetadata): ProjectInfo {
  const { projectId, displayName, resources } = projectMetaData;
  return {
    id: projectId,
    label: `${projectId}` + (displayName ? ` (${displayName})` : ""),
    instance: _.get(resources, "realtimeDatabaseInstance"),
    location: _.get(resources, "locationId"),
  };
}

/**
 * Sets up the default project if provided and writes .firebaserc file.
 * @param setup A helper object to use for the rest of the init features.
 * @param config Configuration for the project.
 * @param options Command line options.
 */
export async function doSetup(setup: any, config: Config, options: any): Promise<void> {
  setup.project = {};

  logger.info();
  logger.info(`First, let's associate this project directory with a Firebase project.`);
  logger.info(
    `You can create multiple project aliases by running ${clc.bold("firebase use --add")}, `
  );
  logger.info(`but for now we'll just set up a default project.`);
  logger.info();

  const projectFromRcFile = _.get(setup.rcfile, "projects.default");
  if (projectFromRcFile) {
    utils.logBullet(`.firebaserc already has a default project, using ${projectFromRcFile}.`);
    // we still need to get project info in case user wants to init firestore or storage, which
    // require a resource location:
    const rcProject: FirebaseProjectMetadata = await getFirebaseProject(projectFromRcFile);
    setup.projectId = projectFromRcFile;
    setup.projectLocation = _.get(rcProject, "resources.locationId");
    return;
  }

  const choices = [
    { name: OPTION_USE_PROJECT, value: OPTION_USE_PROJECT },
    { name: OPTION_NEW_PROJECT, value: OPTION_NEW_PROJECT },
    { name: OPTION_NO_PROJECT, value: OPTION_NO_PROJECT },
  ];
  const projectSetupOption: string = await promptOnce({
    type: "list",
    name: "id",
    message: "Please select an option:",
    choices,
  });

  if (projectSetupOption === OPTION_USE_PROJECT) {
    const projectInfo = await getProjectInfo(options);
    utils.logBullet(`Using project ${projectInfo.label}`);

    // write "default" alias and activate it immediately
    _.set(setup.rcfile, "projects.default", projectInfo.id);
    setup.projectId = projectInfo.id;
    setup.instance = projectInfo.instance;
    setup.projectLocation = projectInfo.location;
    utils.makeActiveProject(config.projectDir, projectInfo.id);
  } else if (projectSetupOption === OPTION_NEW_PROJECT) {
    // TODO(caot): Implement create a new project
    setup.createProject = true;
  }
}
