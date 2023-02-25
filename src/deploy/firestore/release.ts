import * as _ from "lodash";

import { RulesDeploy, RulesetServiceType } from "../../rulesDeploy";
import { logger } from "../../logger";
import { Options } from "../../options";

/**
 * Releases Firestore rules.
 * @param context The deploy context.
 * @param options The CLI options object.
 */
export default async function (context: any, options: Options): Promise<any> {
  const rulesDeploy: RulesDeploy = _.get(context, "firestore.rulesDeploy");
  if (!context.firestoreRules || !rulesDeploy) {
    return Promise.resolve();
  }

  const rulesContext = _.get(context, "firestore.rules");
  return Promise.all(
    rulesContext.map((ruleContext: any) => {
      const databaseId = ruleContext.databaseId;
      const rulesFile = ruleContext.rulesFile;
      if (!rulesFile) {
        logger.error(
          `Invalid firestore config for ${databaseId} database: ${JSON.stringify(
            options.config.src.firestore
          )}`
        );
        return Promise.resolve();
      }
      return Promise.resolve(
        rulesDeploy.release(rulesFile, RulesetServiceType.CLOUD_FIRESTORE, databaseId)
      );
    })
  );
}
