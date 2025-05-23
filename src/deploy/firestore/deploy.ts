import * as clc from "colorette";

import { FirestoreApi } from "../../firestore/api";
import * as types from "../../firestore/api-types";
import { logger } from "../../logger";
import * as utils from "../../utils";
import { RulesDeploy, RulesetServiceType } from "../../rulesDeploy";
import { IndexContext } from "./prepare";

/**
 * Deploys Firestore Rules.
 * @param context The deploy context.
 */
async function createDatabase(context: any, options: any): Promise<void> {
  console.log(context);
  // console.log(options);
  // console.log(context.firestore);
  // console.log(context.firestore.RulesDeploy);
  const databaseId: string = context?.firestore?.databaseId;
  const api = new FirestoreApi();
  try {
    const db = await api.getDatabase(options.projectId, databaseId);
    console.log(db);
  } catch (e: any) {
    if (e.status === 404) {
      // Database is not found. Let's create it.
      console.log("Database not found");
      const createDatabaseReq: types.CreateDatabaseReq = {
        project: options.projectId,
        databaseId: databaseId,
        // TODO: Should we make Firestore locationID configurable in `firebase init`?
        locationId: "nam5", // Multi-region in US. The default in Firebase Console.
        type: types.DatabaseType.FIRESTORE_NATIVE,
        deleteProtectionState: types.DatabaseDeleteProtectionState.DISABLED,
        pointInTimeRecoveryEnablement: types.PointInTimeRecoveryEnablement.DISABLED,
      };
      console.log(createDatabaseReq);
      const databaseResp: types.DatabaseResp = await api.createDatabase(createDatabaseReq);
      console.log(databaseResp);
    }
    console.log(e);
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

      await firestoreIndexes.deploy(options, indexes, fieldOverrides, databaseId).then(() => {
        utils.logSuccess(
          `${clc.bold(clc.green("firestore:"))} deployed indexes in ${clc.bold(
            indexesFileName,
          )} successfully for ${databaseId} database`,
        );
      });
    }),
  );
}

/**
 * Deploy indexes.
 * @param context The deploy context.
 * @param options The CLI options object.
 */
export default async function (context: any, options: any): Promise<void> {
  await createDatabase(context, options);
  await Promise.all([deployRules(context), deployIndexes(context, options)]);
}
