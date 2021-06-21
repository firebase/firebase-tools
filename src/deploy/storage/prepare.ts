import * as _ from "lodash";

import gcp = require("../../gcp");
import { RulesDeploy, RulesetServiceType } from "../../rulesDeploy";
import { Options } from "../../options";

/**
 * Prepares for a Firebase Storage deployment.
 * @param context The deploy context.
 * @param options The CLI options object.
 */
export default async function (context: any, options: Options): Promise<void> {
  let rulesConfig = options.config.get("storage");
  if (!rulesConfig) {
    return;
  }

  _.set(context, "storage.rules", rulesConfig);

  const rulesDeploy = new RulesDeploy(options, RulesetServiceType.FIREBASE_STORAGE);
  _.set(context, "storage.rulesDeploy", rulesDeploy);

  if (_.isPlainObject(rulesConfig)) {
    const defaultBucket = await gcp.storage.getDefaultBucket(options.project);
    rulesConfig = [_.assign(rulesConfig, { bucket: defaultBucket })];
    _.set(context, "storage.rules", rulesConfig);
  }

  rulesConfig.forEach((ruleConfig: any) => {
    if (ruleConfig.target) {
      (options.rc as any).requireTarget(context.projectId, "storage", ruleConfig.target);
    }
    rulesDeploy.addFile(ruleConfig.rules);
  });

  await rulesDeploy.compile();
}
