import * as Command from "../command";
import * as clc from "cli-color";
import * as logger from "../logger";
import * as requirePermissions from "../requirePermissions";
import * as gcp from "../gcp";
import { PageOfRulesets } from "../gcp/rules";

module.exports = new Command("rules:delete <ruleset_name>")
  .description("Delete a ruleset from your project.")
  .before(requirePermissions, ["firebaserules.rulesets.delete"])
  .action(async (input: string, options: any) => {
    const rulesetId = extractRulesetId(input);
    logger.info(`deleting ruleset ${rulesetId}...`);
    await gcp.rules.deleteRuleset(options.project, rulesetId);
  });

const RULESET_NAME_REGEX = /^projects\/[A-Za-z0-9-]+\/rulesets\/([0-9a-f-]{36})$/;
function extractRulesetId(input: string): string {
  const match = RULESET_NAME_REGEX.exec(input);
  return match === null ? input : match[1];
}
