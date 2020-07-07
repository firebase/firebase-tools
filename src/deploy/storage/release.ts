import { get } from "lodash";

import { RulesDeploy, RulesetServiceType } from "../../rulesDeploy";

/**
 * Releases Firebase Storage rules.
 * @param context The deploy context.
 * @param options The CLI options object.
 */
export default async function(context: any, options: any): Promise<void> {
  const rules = get(context, "storage.rules", []);
  const rulesDeploy: RulesDeploy = get(context, "storage.rulesDeploy");
  if (!rules.length || !rulesDeploy) {
    return;
  }

  const toRelease: Array<{ bucket: string; rules: any }> = [];
  for (const ruleConfig of rules) {
    if (ruleConfig.target) {
      options.rc.target(options.project, "storage", ruleConfig.target).forEach((bucket: string) => {
        toRelease.push({ bucket: bucket, rules: ruleConfig.rules });
      });
    } else {
      toRelease.push({ bucket: ruleConfig.bucket, rules: ruleConfig.rules });
    }
  }

  await Promise.all(
    toRelease.map((release) => {
      return rulesDeploy.release(
        release.rules,
        RulesetServiceType.FIREBASE_STORAGE,
        release.bucket
      );
    })
  );
}
