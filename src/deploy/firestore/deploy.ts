import * as _ from "lodash";
import * as clc from "colorette";

import { FirestoreIndexes } from "../../firestore/indexes";
import { logger } from "../../logger";
import utils = require("../../utils");
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
  const firestoreIndexes = new FirestoreIndexes();
  indexesContext.map(async (indexContext: IndexContext) => {
    const { databaseId, indexesFileName, indexesSrc } = indexContext;
    if (!indexesSrc) {
      logger.debug(`No Firestore indexes present for ${databaseId} database.`);
      return Promise.resolve();
    }
    const indexes = indexesSrc.indexes;
    if (!indexes) {
      logger.error(`${databaseId} database index file must contain "indexes" property.`);
      return;
    }
    const fieldOverrides = indexesSrc.fieldOverrides || [];

    await firestoreIndexes.deploy(options, indexes, fieldOverrides, databaseId).then(() => {
      utils.logSuccess(
        `${clc.bold(clc.green("firestore:"))} deployed indexes in ${clc.bold(
          indexesFileName
        )} successfully for ${databaseId} database`
      );
    });
  });
}

/**
 * Deploy indexes.
 * @param context The deploy context.
 * @param options The CLI options object.
 */
export default async function (context: any, options: any): Promise<void> {
  await Promise.all([deployRules(context), deployIndexes(context, options)]);
}
