import * as Command from "../command";
import * as clc from "cli-color";
import * as logger from "../logger";
import * as requirePermissions from "../requirePermissions";
import * as gcp from "../gcp";
import { PageOfRulesets } from "../gcp/rules";

module.exports = new Command("rules:delete <ruleset_name>")
  .description("Delete a ruleset from your project.")
  .before(requirePermissions, ["firebaserules.rulesets.delete"])
  .action(async (rulesetName: string, options: any) => {
    console.log(`deleting ruleset ${rulesetName}...`);
    await gcp.rules.deleteRuleset(options.project, rulesetName);
    console.log("done");
  });
