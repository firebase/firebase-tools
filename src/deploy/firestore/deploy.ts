import * as clc from "colorette";

import { FirestoreApi } from "../../firestore/api";
import { logger } from "../../logger";
import * as utils from "../../utils";
import { RulesDeploy, RulesetServiceType } from "../../rulesDeploy";
import { IndexContext } from "./prepare";
import { sleep } from "../../utils";
import { Options } from "../../options";

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
  if (!indexesContext) {
    return;
  }

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
  await deployRules(context);
  await deployIndexes(context, options);
}
