import * as _ from "lodash";

import { RulesDeploy, RulesetServiceType } from "../../rulesDeploy";
import { Options } from "../../options";
import { FirebaseError } from "../../error";

/**
 * Releases Firestore rules.
 * @param context The deploy context.
 * @param options The CLI options object.
 */
export default async function (context: any, options: Options): Promise<void> {
  const rulesDeploy: RulesDeploy = _.get(context, "firestore.rulesDeploy");
  if (!context.firestoreRules || !rulesDeploy) {
    return;
  }

  // todo victorvim 
  const rulesFile = options.config.src.firestore && 'rules' in options.config.src.firestore && options.config.src.firestore?.rules;
  if (!rulesFile) {
    throw new FirebaseError(
      `Invalid firestore config: ${JSON.stringify(options.config.src.firestore)}`
    );
  }
  await rulesDeploy.release(rulesFile, RulesetServiceType.CLOUD_FIRESTORE);
}
