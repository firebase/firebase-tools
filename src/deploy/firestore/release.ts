import * as _ from "lodash";

import { RulesDeploy, RulesetServiceType } from "../../rulesDeploy";
import { logger } from "../../logger";
import { Options } from "../../options";
import { RulesContext } from "./prepare";

/**
 * Releases Firestore rules.
 * @param context The deploy context.
 * @param options The CLI options object.
 */
export default async function (context: any, options: Options): Promise<void> {
  const rulesDeploy: RulesDeploy = _.get(context, "firestore.rulesDeploy");
  if (!context.firestoreRules || !rulesDeploy) {
    return Promise.resolve();
  }

  const rulesContext: RulesContext[] = context?.firestore?.rules;
  rulesContext.map(async (ruleContext: any) => {
    const databaseId = ruleContext.databaseId;
    const rulesFile = ruleContext.rulesFile;
    if (!rulesFile) {
      logger.error(
        `Invalid firestore config for ${databaseId} database: ${JSON.stringify(
          options.config.src.firestore
        )}`
      );
      return;
    }
    await rulesDeploy.release(rulesFile, RulesetServiceType.CLOUD_FIRESTORE, databaseId);
  });
}
