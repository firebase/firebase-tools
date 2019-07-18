import * as clc from "cli-color";
import * as _ from "lodash";

import * as Config from "../../config";
import { FirebaseError } from "../../error";
import {
  FirebaseProjectMetadata,
  getFirebaseProject,
  listFirebaseProjects,
} from "../../management/projects";
import * as logger from "../../logger";
import { promptOnce, Question } from "../../prompt";
import * as utils from "../../utils";

const NO_PROJECT = "[don't setup a default project]";
const NEW_PROJECT = "[create a new project]";

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
    return selectProjectFromOptions(options);
  }
  return selectProjectFromList(options);
}

/**
 * Selects project when --project is passed in.
 * @param options Command line options.
 */
async function selectProjectFromOptions(options: any): Promise<ProjectInfo> {
  let project: FirebaseProjectMetadata;
  try {
    project = await getFirebaseProject(options.project);
  } catch (e) {
    throw new FirebaseError(`Error getting project ${options.project}: ${e}`);
  }
  const projectId = project.projectId;
  const name = project.displayName;
  return {
    id: projectId,
    label: `${projectId} (${name})`,
    instance: _.get(project, "resources.realtimeDatabaseInstance"),
    location: _.get(project, "resources.locationId"),
  };
}

/**
 * Presents user with list of projects to choose from and gets project
 * information for chosen project.
 * @param options Command line options.
 */
async function selectProjectFromList(options: any): Promise<ProjectInfo> {
  const projects: FirebaseProjectMetadata[] = await listFirebaseProjects();
  let choices = projects.filter((p: FirebaseProjectMetadata) => !!p).map((p) => {
    return {
      name: `${p.projectId} (${p.displayName})`,
      value: p.projectId,
    };
  });
  choices = _.orderBy(choices, ["name"], ["asc"]);
  choices.unshift({ name: NO_PROJECT, value: NO_PROJECT });
  choices.push({ name: NEW_PROJECT, value: NEW_PROJECT });

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
  if (projectId === NEW_PROJECT || projectId === NO_PROJECT) {
    return { id: projectId };
  }

  let project: FirebaseProjectMetadata | undefined;
  project = projects.find((p) => p.projectId === projectId);
  const pId = choices.find((p) => p.value === projectId);
  const label = pId ? pId.name : "";

  return {
    id: projectId,
    label,
    instance: _.get(project, "resources.realtimeDatabaseInstance"),
    location: _.get(project, "resources.locationId"),
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

  const projectInfo = await getProjectInfo(options);
  if (projectInfo.id === NEW_PROJECT) {
    setup.createProject = true;
    return;
  } else if (projectInfo.id === NO_PROJECT) {
    return;
  }

  utils.logBullet(`Using project ${projectInfo.label}`);

  // write "default" alias and activate it immediately
  _.set(setup.rcfile, "projects.default", projectInfo.id);
  setup.projectId = projectInfo.id;
  setup.instance = projectInfo.instance;
  setup.projectLocation = projectInfo.location;
  utils.makeActiveProject(config.projectDir, projectInfo.id);
}
