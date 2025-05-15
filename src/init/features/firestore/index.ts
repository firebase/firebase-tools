import { logger } from "../../../logger";
import * as apiEnabled from "../../../ensureApiEnabled";
import { requirePermissions } from "../../../requirePermissions";
import { checkDatabaseType } from "../../../firestore/checkDatabaseType";
import * as rules from "./rules";
import * as indexes from "./indexes";
import { FirebaseError } from "../../../error";

import * as clc from "colorette";
import { input } from "../../../prompt";
import { Config } from "../../../config";
import { Setup } from "../..";

export interface RequiredInfo {
  databaseId: string;
  rulesFilename: string;
  rules: string;
  writeRules: boolean;
  indexesFilename: string;
  indexes: string;
  writeIndexes: boolean;
}

/** Returns the Firestore databaseId. */
async function checkProjectSetup(setup: Setup, options: any, info: RequiredInfo): Promise<void> {
  const firestoreUnusedError = new FirebaseError(
    `It looks like you haven't used Cloud Firestore in this project before. Go to ${clc.bold(
      clc.underline(`https://console.firebase.google.com/project/${setup.projectId}/firestore`),
    )} to create your Cloud Firestore database.`,
    { exit: 1 },
  );

  // First check if the Firestore API is enabled. If it's not, then the developer needs
  // to go set up Firestore in the console.
  const isFirestoreEnabled = await apiEnabled.check(
    setup.projectId!,
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
  info.databaseId = info.databaseId || "(default)";
  let dbType = await checkDatabaseType(setup.projectId!, info.databaseId);
  if (dbType === "DATABASE_DOES_NOT_EXIST") {
    info.databaseId = await selectDatabaseByPrompting();
    dbType = await checkDatabaseType(setup.projectId!, info.databaseId);
  }
  if (dbType !== "FIRESTORE_NATIVE") {
    logger.debug(`firestore database_type: ${dbType}`);
    throw new FirebaseError(
      `It looks like this project is using Cloud Datastore or Cloud Firestore in Datastore mode. The Firebase CLI can only manage projects using Cloud Firestore in Native mode. For more information, visit https://cloud.google.com/datastore/docs/firestore-or-datastore`,
      { exit: 1 },
    );
  }

  await requirePermissions({ ...options, project: setup.projectId });
}

function selectDatabaseByPrompting(): Promise<string> {
  return input("Please input the name of the Native Firestore database you would like to use:");
}

// Kept around for unit tests.
export async function doSetup(setup: Setup, config: Config, options: any): Promise<void> {
  await askQuestions(setup, config, options);
  await actuate(setup, config);
}

export async function askQuestions(setup: Setup, config: Config, options: any): Promise<void> {
  const firestore = !Array.isArray(setup.config.firestore) ? setup.config.firestore : undefined;
  const info: RequiredInfo = {
    databaseId: firestore?.database || "",
    rulesFilename: firestore?.rules || "",
    rules: "",
    writeRules: true,
    indexesFilename: firestore?.indexes || "",
    indexes: "",
    writeIndexes: true,
  };
  if (setup.projectId) {
    await checkProjectSetup(setup, options, info);
  }

  await rules.initRules(setup, config, info);
  await indexes.initIndexes(setup, config, info);

  // Populate featureInfo for the actuate step later.
  setup.featureInfo = setup.featureInfo || {};
  setup.featureInfo.firestore = info;
}

export async function actuate(setup: Setup, config: Config): Promise<void> {
  const info = setup.featureInfo?.firestore;
  if (!info) {
    throw new FirebaseError("Firestore featureInfo is not found");
  }
  // Populate defaults and update `firebase.json` config.
  info.databaseId = info.databaseId || "(default)";
  info.rules = info.rules || rules.getDefaultRules();
  info.rulesFilename = info.rulesFilename || rules.DEFAULT_RULES_FILE;
  info.indexes = info.indexes || indexes.INDEXES_TEMPLATE;
  info.indexesFilename = info.indexesFilename || indexes.DEFAULT_INDEXES_FILE;
  setup.config.firestore = {
    database: info.databaseId,
    rules: info.rulesFilename,
    indexes: info.indexesFilename,
  };

  if (info.writeRules) {
    config.writeProjectFile(info.rulesFilename, info.rules);
  }
  if (info.writeIndexes) {
    config.writeProjectFile(info.indexesFilename, info.indexes);
  }
}
