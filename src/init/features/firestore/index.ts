import { logger } from "../../../logger";
import * as apiEnabled from "../../../ensureApiEnabled";
import { requirePermissions } from "../../../requirePermissions";
import { checkDatabaseType } from "../../../firestore/checkDatabaseType";
import * as rules from "./rules";
import * as indexes from "./indexes";
import { FirebaseError } from "../../../error";

import * as clc from "colorette";
import { promptOnce } from "../../../prompt";

async function checkProjectSetup(setup: any, config: any, options: any) {
  const firestoreUnusedError = new FirebaseError(
    `It looks like you haven't used Cloud Firestore in this project before. Go to ${clc.bold(
      clc.underline(`https://console.firebase.google.com/project/${setup.projectId}/firestore`),
    )} to create your Cloud Firestore database.`,
    { exit: 1 },
  );

  // First check if the Firestore API is enabled. If it's not, then the developer needs
  // to go set up Firestore in the console.
  const isFirestoreEnabled = await apiEnabled.check(
    setup.projectId,
    "firestore.googleapis.com",
    "",
    true,
  );
  if (!isFirestoreEnabled) {
    throw firestoreUnusedError;
  }

  // Next, use the AppEngine Apps API to check the database type.
  // This allows us to filter out projects that are not using Firestore in Native mode.
  // Will also prompt user for databaseId if default does not exist.
  const dbType = await getDatabaseType(setup);
  logger.debug(`database_type: ${dbType}`);

  if (!dbType) {
    throw firestoreUnusedError;
  } else if (dbType !== "FIRESTORE_NATIVE") {
    throw new FirebaseError(
      `It looks like this project is using Cloud Datastore or Cloud Firestore in Datastore mode. The Firebase CLI can only manage projects using Cloud Firestore in Native mode. For more information, visit https://cloud.google.com/datastore/docs/firestore-or-datastore`,
      { exit: 1 },
    );
  }

  await requirePermissions({ ...options, project: setup.projectId });
}

/**
 * Potentially recursive function that will allow a user to input the name of their database if the
 * (default) does not exist. Modifies the setup object to include the databaseId, for use later by
 * the indexes.initIndexes() which has methods for non-default databaseId's.
 */
async function getDatabaseType(setup: any): Promise<string | undefined> {
  const dbType = await checkDatabaseType(setup.projectId, setup.databaseId);
  logger.debug(`database_type: ${dbType}`);
  if (dbType === "DATABASE_DOES_NOT_EXIST") {
    setup.databaseId = await selectDatabaseByPrompting();
    return await getDatabaseType(setup);
  } else {
    return dbType;
  }
}

async function selectDatabaseByPrompting(): Promise<string> {
  const database = await promptOnce({
    type: "input",
    message: "Please input the name of the Native Firestore database you would like to use:",
  });
  return database;
}

export async function doSetup(setup: any, config: any, options: any): Promise<void> {
  if (setup.projectId) {
    await checkProjectSetup(setup, config, options);
  }

  setup.config.firestore = {};
  await rules.initRules(setup, config);
  await indexes.initIndexes(setup, config);
}
