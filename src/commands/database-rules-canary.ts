import { Command } from "../command";
import * as logger from "../logger";
import * as requireInstance from "../requireInstance";
import { requirePermissions } from "../requirePermissions";
import * as metadata from "../database/metadata";

export default new Command("database:rules:canary <ruleset_id>")
  .description("mark a staged ruleset as the canary ruleset")
  .option(
    "--instance <instance>",
    "use the database <instance>.firebaseio.com (if omitted, uses default database instance)"
  )
  .before(requirePermissions, ["firebasedatabase.instances.update"])
  .before(requireInstance)
  .action(async (rulesetId: string, options: any) => {
    const oldLabels = await metadata.getRulesetLabels(options.instance);
    const newLabels = {
      stable: oldLabels.stable,
      canary: rulesetId,
    };
    await metadata.setRulesetLabels(options.instance, newLabels);
    return newLabels;
  });
