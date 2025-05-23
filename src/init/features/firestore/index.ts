import * as rules from "./rules";
import * as indexes from "./indexes";
import { FirebaseError } from "../../../error";

import { Config } from "../../../config";
import { Setup } from "../..";
import { FirestoreApi } from "../../../firestore/api";
import { select } from "../../../prompt";
import { ensure } from "../../../ensureApiEnabled";
import { firestoreOrigin } from "../../../api";

export interface RequiredInfo {
  databaseId: string;
  locationId: string;
  rulesFilename: string;
  rules: string;
  writeRules: boolean;
  indexesFilename: string;
  indexes: string;
  writeIndexes: boolean;
}

export async function askQuestions(setup: Setup, config: Config): Promise<void> {
  const firestore = !Array.isArray(setup.config.firestore) ? setup.config.firestore : undefined;
  const info: RequiredInfo = {
    databaseId: firestore?.database || "",
    locationId: firestore?.location || "",
    rulesFilename: firestore?.rules || "",
    rules: "",
    writeRules: true,
    indexesFilename: firestore?.indexes || "",
    indexes: "",
    writeIndexes: true,
  };
  if (setup.projectId) {
    await ensure(setup.projectId, firestoreOrigin(), "firestore");
    // Next, use the AppEngine Apps API to check the database type.
    // This allows us to filter out projects that are not using Firestore in Native mode.
    // Will also prompt user for databaseId if default does not exist.
    info.databaseId = info.databaseId || "(default)";
    const api = new FirestoreApi();
    const databases = await api.listDatabases(setup.projectId!);
    const nativeDatabaseNames = databases
      .filter((db) => db.type === "FIRESTORE_NATIVE")
      .map((db) => db.name.split("/")[3]);
    if (nativeDatabaseNames.length === 0) {
      if (databases.length > 0) {
        // Has non-native Firestore databases
        throw new FirebaseError(
          `It looks like this project is using Cloud Firestore in ${databases[0].type}. The Firebase CLI can only manage projects using Cloud Firestore in Native mode. For more information, visit https://cloud.google.com/datastore/docs/firestore-or-datastore`,
          { exit: 1 },
        );
      }
      // Create the default database in deploy later.
      info.databaseId = "(default)";
      const locations = await api.locations(setup.projectId!);
      const choice = await select<string>({
        message: "Please select the location of your Firestore database:",
        choices: locations.map((location) => location.name.split("/")[3]),
        default: "nam5",
      });
      info.locationId = choice;
    } else if (nativeDatabaseNames.length === 1) {
      info.databaseId = nativeDatabaseNames[0];
      info.locationId = databases
        .filter((db) => db.name.endsWith(`databases/${info.databaseId}`))
        .map((db) => db.locationId)[0];
    } else if (nativeDatabaseNames.length > 1) {
      const choice = await select<string>({
        message: "Please select the name of the Native Firestore database you would like to use:",
        choices: nativeDatabaseNames,
      });
      info.databaseId = choice;
      info.locationId = databases
        .filter((db) => db.name.endsWith(`databases/${info.databaseId}`))
        .map((db) => db.locationId)[0];
    }
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
  info.locationId = info.locationId || "nam5";
  info.rules = info.rules || rules.getDefaultRules();
  info.rulesFilename = info.rulesFilename || rules.DEFAULT_RULES_FILE;
  info.indexes = info.indexes || indexes.INDEXES_TEMPLATE;
  info.indexesFilename = info.indexesFilename || indexes.DEFAULT_INDEXES_FILE;
  setup.config.firestore = {
    database: info.databaseId,
    location: info.locationId,
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
