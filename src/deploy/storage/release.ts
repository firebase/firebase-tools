import { get } from "lodash";

import { RulesDeploy, RulesetServiceType } from "../../rulesDeploy";

/**
 * Releases Firebase Storage rules.
 * @param context The deploy context.
 * @param options The CLI options object.
 * @return the list of buckets deployed.
 */
export default async function (context: any, options: any): Promise<string[]> {
  const rulesConfigsToDeploy: any[] = get(context, "storage.rulesConfigsToDeploy", []);
  const rulesDeploy: RulesDeploy = get(context, "storage.rulesDeploy");
  if (!rulesConfigsToDeploy.length || !rulesDeploy) {
    return [];
  }

  const toRelease: Array<{ bucket: string; rules: any }> = [];
  for (const ruleConfig of rulesConfigsToDeploy) {
    if (ruleConfig.target) {
      options.rc.target(options.project, "storage", ruleConfig.target).forEach((bucket: string) => {
        toRelease.push({ bucket: bucket, rules: ruleConfig.rules });
      });
    } else {
      toRelease.push({ bucket: ruleConfig.bucket, rules: ruleConfig.rules });
    }
  }

  await Promise.all(
    toRelease.map((r) => {
      return rulesDeploy.release(r.rules, RulesetServiceType.FIREBASE_STORAGE, r.bucket);
    }),
  );

  return toRelease.map((r) => r.bucket);
}
