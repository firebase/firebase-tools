import { logger } from "../../../logger";
import * as apiEnabled from "../../../ensureApiEnabled";
import { requirePermissions } from "../../../requirePermissions";
import { checkDatabaseType } from "../../../firestore/checkDatabaseType";
import * as rules from "./rules";
import * as indexes from "./indexes";
import { FirebaseError } from "../../../error";

import * as clc from "colorette";

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
  const dbType = await checkDatabaseType(setup.projectId);
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

export async function doSetup(setup: any, config: any, options: any): Promise<void> {
  if (setup.projectId) {
    await checkProjectSetup(setup, config, options);
  }

  setup.config.firestore = {};
  await rules.initRules(setup, config);
  await indexes.initIndexes(setup, config);
}
