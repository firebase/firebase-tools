import * as clc from "cli-color";
import * as _ from "lodash";

import * as Config from "../../config";
import { FirebaseError } from "../../error";
import {
  addFirebaseToCloudProjectAndLog,
  createFirebaseProjectAndLog,
  FirebaseProjectMetadata,
  getFirebaseProject,
  getOrPromptProject,
  PROJECTS_CREATE_QUESTIONS,
  promptAvailableProjectId,
} from "../../management/projects";
import * as logger from "../../logger";
import { prompt, promptOnce } from "../../prompt";
import * as utils from "../../utils";

const OPTION_NO_PROJECT = "Don't set up a default project";
const OPTION_USE_PROJECT = "Use an existing project";
const OPTION_NEW_PROJECT = "Create a new project";
const OPTION_ADD_FIREBASE = "Add Firebase to an existing Google Cloud Platform project";

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

function toProjectInfo(projectMetaData: FirebaseProjectMetadata): ProjectInfo {
  const { projectId, displayName, resources } = projectMetaData;
  return {
    id: projectId,
    label: `${projectId}` + (displayName ? ` (${displayName})` : ""),
    instance: _.get(resources, "realtimeDatabaseInstance"),
    location: _.get(resources, "locationId"),
  };
}

async function promptAndCreateNewProject(): Promise<FirebaseProjectMetadata> {
  utils.logBullet(
    "If you want to create a project in a Google Cloud organization or folder, please use " +
      `"firebase projects:create" instead, and return to this command when you've created the project.`
  );
  const promptAnswer: { projectId?: string; displayName?: string } = {};
  await prompt(promptAnswer, PROJECTS_CREATE_QUESTIONS);
  if (!promptAnswer.projectId) {
    throw new FirebaseError("Project ID cannot be empty");
  }

  return await createFirebaseProjectAndLog(promptAnswer.projectId, {
    displayName: promptAnswer.displayName,
  });
}

async function promptAndAddFirebaseToCloudProject(): Promise<FirebaseProjectMetadata> {
  const projectId = await promptAvailableProjectId();
  if (!projectId) {
    throw new FirebaseError("Project ID cannot be empty");
  }
  return await addFirebaseToCloudProjectAndLog(projectId);
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
    setup.projectId = rcProject.projectId;
    setup.projectLocation = _.get(rcProject, "resources.locationId");
    return;
  }

  const choices = [
    { name: OPTION_USE_PROJECT, value: OPTION_USE_PROJECT },
    { name: OPTION_NEW_PROJECT, value: OPTION_NEW_PROJECT },
    { name: OPTION_ADD_FIREBASE, value: OPTION_ADD_FIREBASE },
    { name: OPTION_NO_PROJECT, value: OPTION_NO_PROJECT },
  ];
  const projectSetupOption: string = await promptOnce({
    type: "list",
    name: "id",
    message: "Please select an option:",
    choices,
  });

  let projectMetaData;
  switch (projectSetupOption) {
    case OPTION_USE_PROJECT:
      projectMetaData = await getOrPromptProject(options);
      break;
    case OPTION_NEW_PROJECT:
      projectMetaData = await promptAndCreateNewProject();
      break;
    case OPTION_ADD_FIREBASE:
      projectMetaData = await promptAndAddFirebaseToCloudProject();
      break;
    default:
      // Do nothing if user chooses NO_PROJECT
      return;
  }

  const projectInfo = toProjectInfo(projectMetaData);
  utils.logBullet(`Using project ${projectInfo.label}`);
  // write "default" alias and activate it immediately
  _.set(setup.rcfile, "projects.default", projectInfo.id);
  setup.projectId = projectInfo.id;
  setup.instance = projectInfo.instance;
  setup.projectLocation = projectInfo.location;
  utils.makeActiveProject(config.projectDir, projectInfo.id);
}
