import * as clc from "colorette";
import * as _ from "lodash";

import {
  addFirebaseToCloudProjectAndLog,
  createFirebaseProjectAndLog,
  getFirebaseProject,
  promptAvailableProjectId,
  promptProjectCreation,
  selectProjectInteractively,
} from "../../management/projects";
import { FirebaseProjectMetadata } from "../../types/project";
import { logger } from "../../logger";
import * as utils from "../../utils";
import * as prompt from "../../prompt";
import { requireAuth } from "../../requireAuth";
import { Constants } from "../../emulator/constants";

const OPTION_NO_PROJECT = "Don't set up a default project";
const OPTION_USE_PROJECT = "Use an existing project";
const OPTION_NEW_PROJECT = "Create a new project";
const OPTION_ADD_FIREBASE = "Add Firebase to an existing Google Cloud Platform project";

/**
 * Sets up the default project if provided and writes .firebaserc file.
 * @param setup A helper object to use for the rest of the init features.
 * @param config Configuration for the project.
 * @param options Command line options.
 */
export async function doSetup(setup: any, config: any, options: any): Promise<void> {
  setup.project = {};

  logger.info();
  logger.info(`First, let's associate this project directory with a Firebase project.`);
  logger.info(
    `You can create multiple project aliases by running ${clc.bold("firebase use --add")}, `,
  );
  logger.info();

  if (options.project) {
    // If the user presented a project with `--project`, try to fetch that project.
    if (Constants.isDemoProject(options.project)) {
      logger.info(`Skipping Firebase project setup because a demo project is provided`);
      return;
    }
    await requireAuth(options);
    await usingProject(setup, config, options.project, "--project flag");
    return;
  }
  const projectFromRcFile = setup.rcfile?.projects?.default;
  if (projectFromRcFile) {
    await usingProject(setup, config, projectFromRcFile as string, ".firebaserc");
    return;
  }
  const projectEnvVar = utils.envOverride("FIREBASE_PROJECT", "");
  if (projectEnvVar) {
    // If env var $FIREBASE_PROJECT is set, try to fetch that project.
    // This is used in some shell scripts e.g. under https://firebase.tools/.
    await usingProject(setup, config, projectEnvVar, "$FIREBASE_PROJECT");
    return;
  }
  if (options.nonInteractive) {
    logger.info("No default project found. Continuing without a project in non interactive mode.");
    return;
  }

  // Prompt users about how to setup a project.
  const choices = [OPTION_USE_PROJECT, OPTION_NEW_PROJECT, OPTION_ADD_FIREBASE, OPTION_NO_PROJECT];
  const projectSetupOption: string = await prompt.select<(typeof choices)[number]>({
    message: "Please select an option:",
    choices,
  });
  switch (projectSetupOption) {
    case OPTION_USE_PROJECT: {
      await requireAuth(options);
      const pm = await selectProjectInteractively();
      return await usingProjectMetadata(setup, config, pm);
    }
    case OPTION_NEW_PROJECT: {
      utils.logBullet(
        "If you want to create a project in a Google Cloud organization or folder, please use " +
          `"firebase projects:create" instead, and return to this command when you've created the project.`,
      );
      await requireAuth(options);
      const { projectId, displayName } = await promptProjectCreation(options);
      const pm = await createFirebaseProjectAndLog(projectId, { displayName });
      return await usingProjectMetadata(setup, config, pm);
    }
    case OPTION_ADD_FIREBASE: {
      await requireAuth(options);
      const pm = await addFirebaseToCloudProjectAndLog(await promptAvailableProjectId());
      return await usingProjectMetadata(setup, config, pm);
    }
    default:
      // Do nothing if user chooses NO_PROJECT
      return;
  }
}

async function usingProject(
  setup: any,
  config: any,
  projectId: string,
  from: string,
): Promise<void> {
  const pm = await getFirebaseProject(projectId);
  const label = `${pm.projectId}` + (pm.displayName ? ` (${pm.displayName})` : "");
  utils.logBullet(`Using project ${label} from ${from}.`);
  await usingProjectMetadata(setup, config, pm);
}

async function usingProjectMetadata(
  setup: any,
  config: any,
  pm: FirebaseProjectMetadata,
): Promise<void> {
  // write "default" alias and activate it immediately
  _.set(setup.rcfile, "projects.default", pm.projectId);
  setup.projectId = pm.projectId;
  setup.instance = pm.resources?.realtimeDatabaseInstance;
  setup.projectLocation = pm.resources?.locationId;
  utils.makeActiveProject(config.projectDir, pm.projectId);
}
