import * as clc from "colorette";

import { FirestoreApi } from "../../firestore/api";
import * as types from "../../firestore/api-types";
import { logger } from "../../logger";
import * as utils from "../../utils";
import { RulesDeploy, RulesetServiceType } from "../../rulesDeploy";
import { IndexContext } from "./prepare";
import { FirestoreConfig } from "../../firebaseConfig";
import { sleep } from "../../utils";
import { Options } from "../../options";
import { FirebaseError } from "../../error";

async function createDatabase(context: any, options: Options): Promise<void> {
  let firestoreCfg: FirestoreConfig = options.config.data.firestore;
  if (Array.isArray(firestoreCfg)) {
    firestoreCfg = firestoreCfg[0];
  }
  if (!options.projectId) {
    throw new FirebaseError("Project ID is required to create a Firestore database.");
  }
  if (!firestoreCfg) {
    throw new FirebaseError("Firestore database configuration not found in firebase.json.");
  }
  if (!firestoreCfg.database) {
    firestoreCfg.database = "(default)";
  }

  let edition: types.DatabaseEdition = types.DatabaseEdition.STANDARD;
  if (firestoreCfg.edition) {
    const upperEdition = firestoreCfg.edition.toUpperCase();
    if (
      upperEdition !== types.DatabaseEdition.STANDARD &&
      upperEdition !== types.DatabaseEdition.ENTERPRISE
    ) {
      throw new FirebaseError(
        `Invalid edition specified for database in firebase.json: ${firestoreCfg.edition}`,
      );
    }
    edition = upperEdition as types.DatabaseEdition;
  }

  const api = new FirestoreApi();
  try {
    await api.getDatabase(options.projectId, firestoreCfg.database);
  } catch (e: any) {
    if (e.status === 404) {
      // Database is not found. Let's create it.
      utils.logLabeledBullet(
        "firetore",
        `Creating the new Firestore database ${firestoreCfg.database}...`,
      );
      const createDatabaseReq: types.CreateDatabaseReq = {
        project: options.projectId,
        databaseId: firestoreCfg.database,
        locationId: firestoreCfg.location || "nam5", // Default to 'nam5' if location is not specified
        type: types.DatabaseType.FIRESTORE_NATIVE,
        databaseEdition: edition,
        deleteProtectionState: types.DatabaseDeleteProtectionState.DISABLED,
        pointInTimeRecoveryEnablement: types.PointInTimeRecoveryEnablement.DISABLED,
      };
      await api.createDatabase(createDatabaseReq);
    }
  }
}

/**
 * Deploys Firestore Rules.
 * @param context The deploy context.
 */
async function deployRules(context: any): Promise<void> {
  const rulesDeploy: RulesDeploy = context?.firestore?.rulesDeploy;
  if (!context.firestoreRules || !rulesDeploy) {
    return;
  }
  await rulesDeploy.createRulesets(RulesetServiceType.CLOUD_FIRESTORE);
}

/**
 * Deploys Firestore Indexes.
 * @param context The deploy context.
 * @param options The CLI options object.
 */
async function deployIndexes(context: any, options: any): Promise<void> {
  if (!context.firestoreIndexes) {
    return;
  }
  const indexesContext: IndexContext[] = context?.firestore?.indexes;

  utils.logBullet(clc.bold(clc.cyan("firestore: ")) + "deploying indexes...");
  const firestoreIndexes = new FirestoreApi();
  await Promise.all(
    indexesContext.map(async (indexContext: IndexContext): Promise<void> => {
      const { databaseId, indexesFileName, indexesRawSpec } = indexContext;
      if (!indexesRawSpec) {
        logger.debug(`No Firestore indexes present for ${databaseId} database.`);
        return;
      }
      const indexes = indexesRawSpec.indexes;
      if (!indexes) {
        logger.error(`${databaseId} database index file must contain "indexes" property.`);
        return;
      }
      const fieldOverrides = indexesRawSpec.fieldOverrides || [];

      try {
        await firestoreIndexes.deploy(options, indexes, fieldOverrides, databaseId);
      } catch (err: any) {
        if (err.status !== 404) {
          throw err;
        }
        // It might take a while for the database to be created.
        await sleep(1000);
        await firestoreIndexes.deploy(options!, indexes, fieldOverrides, databaseId);
      }

      utils.logSuccess(
        `${clc.bold(clc.green("firestore:"))} deployed indexes in ${clc.bold(
          indexesFileName,
        )} successfully for ${databaseId} database`,
      );
    }),
  );
}

/**
 * Create the Firestore database, deploy its rules & indexes.
 * @param context The deploy context.
 * @param options The CLI options object.
 */
export default async function (context: any, options: Options): Promise<void> {
  await createDatabase(context, options);
  await deployRules(context);
  await deployIndexes(context, options);
}
