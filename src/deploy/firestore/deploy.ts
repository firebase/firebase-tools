import * as _ from "lodash";
import * as clc from "cli-color";

import { FirebaseError } from "../../error";
import { FirestoreIndexes } from "../../firestore/indexes";
import logger = require("../../logger");
import utils = require("../../utils");
import { RulesDeploy, RulesetServiceType } from "../../rulesDeploy";

/**
 * Deploys Firestore Rules.
 * @param context The deploy context.
 */
async function deployRules(context: any): Promise<void> {
  const rulesDeploy: RulesDeploy = _.get(context, "firestore.rulesDeploy");
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

  const indexesFileName = _.get(context, "firestore.indexes.name");
  const indexesSrc = _.get(context, "firestore.indexes.content");
  if (!indexesSrc) {
    logger.debug("No Firestore indexes present.");
    return;
  }

  const indexes = indexesSrc.indexes;
  if (!indexes) {
    throw new FirebaseError(`Index file must contain an "indexes" property.`);
  }

  const fieldOverrides = indexesSrc.fieldOverrides || [];

  await new FirestoreIndexes().deploy(options, indexes, fieldOverrides);
  utils.logSuccess(
    `${clc.bold.green("firestore:")} deployed indexes in ${clc.bold(indexesFileName)} successfully`
  );
}

/**
 * Deploy indexes.
 * @param context The deploy context.
 * @param options The CLI options object.
 */
export default async function(context: any, options: any): Promise<void> {
  await Promise.all([deployRules(context), deployIndexes(context, options)]);
}
