import * as clc from "colorette";

import { FirestoreApi } from "../../firestore/api";
import { logger } from "../../logger";
import * as utils from "../../utils";
import { RulesDeploy, RulesetServiceType } from "../../rulesDeploy";
import { IndexContext } from "./prepare";

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
  await Promise.all([deployRules(context), deployIndexes(context, options)]);
}
