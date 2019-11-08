import { get } from "lodash";

import { RulesetServiceType } from "../../rulesDeploy";

/**
 * Deploys Firebase Storage rulesets.
 * @param context The deploy context.
 */
export default async function(context: any): Promise<void> {
  const rulesDeploy = get(context, "storage.rulesDeploy");
  if (!rulesDeploy) {
    return;
  }
  await rulesDeploy.createRulesets(RulesetServiceType.FIREBASE_STORAGE);
}
