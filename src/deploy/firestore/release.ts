import * as _ from "lodash";

import { RulesDeploy, RulesetServiceType } from "../../rulesDeploy";

/**
 * Releases Firestore rules.
 * @param context The deploy context.
 * @param options The CLI options object.
 */
export default async function(context: any, options: any): Promise<void> {
  const rulesDeploy: RulesDeploy = _.get(context, "firestore.rulesDeploy");
  if (!context.firestoreRules || !rulesDeploy) {
    return;
  }
  await rulesDeploy.release(
    options.config.get("firestore.rules"),
    RulesetServiceType.CLOUD_FIRESTORE
  );
}
