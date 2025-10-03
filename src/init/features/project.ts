import * as clc from "colorette";
import * as _ from "lodash";

import { FirebaseError } from "../../error";
import {
  addFirebaseToCloudProjectAndLog,
  createFirebaseProjectAndLog,
  getFirebaseProject,
  getOrPromptProject,
  promptAvailableProjectId,
  promptProjectCreation,
} from "../../management/projects";
import { FirebaseProjectMetadata } from "../../types/project";
import { logger } from "../../logger";
import * as utils from "../../utils";
import * as prompt from "../../prompt";
import { Options } from "../../options";
import { EmulatorHub } from "../../emulator/hub";

const OPTION_NO_PROJECT = "Don't set up a default project";
const OPTION_USE_PROJECT = "Use an existing project";
const OPTION_NEW_PROJECT = "Create a new project";
const OPTION_ADD_FIREBASE = "Add Firebase to an existing Google Cloud Platform project";

/**
 * Used in init flows to keep information about the project - basically
 * a shorter version of {@link FirebaseProjectMetadata} with some additional fields.
 */
export interface InitProjectInfo {
  id: string; // maps to FirebaseProjectMetadata.projectId
  label?: string;
  instance?: string; // maps to FirebaseProjectMetadata.resources.realtimeDatabaseInstance
  location?: string; // maps to FirebaseProjectMetadata.resources.locationId
}

function toInitProjectInfo(projectMetaData: FirebaseProjectMetadata): InitProjectInfo {
  const { projectId, displayName, resources } = projectMetaData;
  return {
    id: projectId,
    label: `${projectId}` + (displayName ? ` (${displayName})` : ""),
    instance: resources?.realtimeDatabaseInstance,
    location: resources?.locationId,
  };
}

async function promptAndCreateNewProject(options: Options): Promise<FirebaseProjectMetadata> {
  utils.logBullet(
    "If you want to create a project in a Google Cloud organization or folder, please use " +
      `"firebase projects:create" instead, and return to this command when you've created the project.`,
  );
  const { projectId, displayName } = await promptProjectCreation(options);
  // N.B. This shouldn't be possible because of the validator on the input field, but it
  // is being left around in case there's something I don't know.
  if (!projectId) {
    throw new FirebaseError("Project ID cannot be empty");
  }

  return await createFirebaseProjectAndLog(projectId, { displayName });
}

async function promptAndAddFirebaseToCloudProject(): Promise<FirebaseProjectMetadata> {
  const projectId = await promptAvailableProjectId();
  if (!projectId) {
    // N.B. This shouldn't be possible because of the validator on the input field, but it
    // is being left around in case there's something I don't know.
    throw new FirebaseError("Project ID cannot be empty");
  }
  return await addFirebaseToCloudProjectAndLog(projectId);
}

/**
 * Prompt the user about how they would like to select a project.
 * @param options the Firebase CLI options object.
 * @return the project metadata, or undefined if no project was selected.
 */
async function projectChoicePrompt(options: any): Promise<FirebaseProjectMetadata | undefined> {
  const choices = [OPTION_USE_PROJECT, OPTION_NEW_PROJECT, OPTION_ADD_FIREBASE, OPTION_NO_PROJECT];
  const projectSetupOption: string = await prompt.select<(typeof choices)[number]>({
    message: "Please select an option:",
    choices,
  });

  switch (projectSetupOption) {
    case OPTION_USE_PROJECT:
      return getOrPromptProject(options);
    case OPTION_NEW_PROJECT:
      return promptAndCreateNewProject(options);
    case OPTION_ADD_FIREBASE:
      return promptAndAddFirebaseToCloudProject();
    default:
      // Do nothing if user chooses NO_PROJECT
      return;
  }
}

/**
 * Sets up the default project if provided and writes .firebaserc file.
 * @param setup A helper object to use for the rest of the init features.
 * @param config Configuration for the project.
 * @param options Command line options.
 */
export async function doSetup(setup: any, config: any, options: any): Promise<void> {
  setup.project = {};
  if (options.projectId === EmulatorHub.MISSING_PROJECT_PLACEHOLDER) {
    logger.info(`Skipping Firebase project given --project=${options.projectId}`);
    return;
  }

  logger.info();
  logger.info(`First, let's associate this project directory with a Firebase project.`);
  logger.info(
    `You can create multiple project aliases by running ${clc.bold("firebase use --add")}, `,
  );
  logger.info(`but for now we'll just set up a default project.`);
  logger.info();

  const projectFromRcFile = setup.rcfile?.projects?.default;
  if (projectFromRcFile && !options.project) {
    utils.logBullet(`.firebaserc already has a default project, using ${projectFromRcFile}.`);
    // we still need to get project info in case user wants to init firestore or storage, which
    // require a resource location:
    const rcProject: FirebaseProjectMetadata = await getFirebaseProject(projectFromRcFile);
    setup.projectId = rcProject.projectId;
    setup.projectLocation = rcProject?.resources?.locationId;
    return;
  }

  let projectMetaData;
  if (options.project) {
    // If the user presented a project with `--project`, try to fetch that project.
    logger.debug(`Using project from CLI flag: ${options.project}`);
    projectMetaData = await getFirebaseProject(options.project);
  } else {
    const projectEnvVar = utils.envOverride("FIREBASE_PROJECT", "");
    // If env var $FIREBASE_PROJECT is set, try to fetch that project.
    // This is used in some shell scripts e.g. under https://firebase.tools/.
    if (projectEnvVar) {
      logger.debug(`Using project from $FIREBASE_PROJECT: ${projectEnvVar}`);
      projectMetaData = await getFirebaseProject(projectEnvVar);
    } else {
      if (options.nonInteractive) {
        logger.info(
          "No default project found. Continuing without a project in non interactive mode.",
        );
        return;
      }
      projectMetaData = await projectChoicePrompt(options);
      if (!projectMetaData) {
        return;
      }
    }
  }

  const projectInfo = toInitProjectInfo(projectMetaData);
  utils.logBullet(`Using project ${projectInfo.label}`);
  // write "default" alias and activate it immediately
  _.set(setup.rcfile, "projects.default", projectInfo.id);
  setup.projectId = projectInfo.id;
  setup.instance = projectInfo.instance;
  setup.projectLocation = projectInfo.location;
  utils.makeActiveProject(config.projectDir, projectInfo.id);
}
