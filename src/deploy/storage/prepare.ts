import * as _ from "lodash";

import * as gcp from "../../gcp";
import { RulesDeploy, RulesetServiceType } from "../../rulesDeploy";
import { Options } from "../../options";
import { FirebaseError } from "../../error";

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

  const onlyTargets = new Set<string>();
  let allStorage = !options.only;
  if (options.only) {
    const split = options.only.split(",");
    if (split.includes("storage")) {
      allStorage = true;
    } else {
      for (const value of split) {
        if (value.startsWith("storage:")) {
          onlyTargets.add(value.split(":")[1]);
        }
      }
    }
  }

  _.set(context, "storage.rules", rulesConfig);

  const rulesDeploy = new RulesDeploy(options, RulesetServiceType.FIREBASE_STORAGE);
  _.set(context, "storage.rulesDeploy", rulesDeploy);

  if (!Array.isArray(rulesConfig)) {
    const defaultBucket = await gcp.storage.getDefaultBucket(options.project);
    rulesConfig = [Object.assign(rulesConfig, { bucket: defaultBucket })];
    _.set(context, "storage.rules", rulesConfig);
  }

  for (const ruleConfig of rulesConfig) {
    const target: string = ruleConfig.target;
    if (target) {
      options.rc.requireTarget(context.projectId, "storage", target);
    }
    if (allStorage || onlyTargets.has(target)) {
      rulesDeploy.addFile(ruleConfig.rules);
      onlyTargets.delete(target);
    }
  }

  if (!allStorage && onlyTargets.size !== 0) {
    throw new FirebaseError(
      `Could not find rules for the following storage targets: ${[...onlyTargets].join(", ")}`
    );
  }

  await rulesDeploy.compile();
}
