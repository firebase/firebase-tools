import * as gcp from "../../../gcp";
import * as utils from "../../../utils";

export async function getRulesFromConsole(projectId: string): Promise<string | null> {
  const defaultBucket = await gcp.storage.getDefaultBucket(projectId);
  const name = await gcp.rules.getLatestRulesetName(projectId, "firebase.storage", defaultBucket);
  if (!name) {
    return null;
  }

  const rules = await gcp.rules.getRulesetContent(name);
  if (rules.length <= 0) {
    return utils.reject("Ruleset has no files", { exit: 1 });
  }

  if (rules.length > 1) {
    return utils.reject("Ruleset has too many files: " + rules.length, { exit: 1 });
  }

  return rules[0].content;
}
