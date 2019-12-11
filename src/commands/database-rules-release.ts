import { Command } from "../command";
import * as logger from "../logger";
import * as requireInstance from "../requireInstance";
import { requirePermissions } from "../requirePermissions";
import * as metadata from "../database/metadata";

export default new Command("database:rules:release <ruleset_id>")
  .description("mark a staged ruleset as the stable ruleset")
  .option(
    "--instance <instance>",
    "use the database <instance>.firebaseio.com (if omitted, uses default database instance)"
  )
  .before(requirePermissions, ["firebasedatabase.instances.get"])
  .before(requireInstance)
  .action(async (rulesetId: string, options: any) => {
    const labeled = await metadata.getRulesetLabels(options.instance);
    await metadata.setRulesetLabels(options.instance, {
      stable: rulesetId,
      canary: labeled.canary,
    });
    return null;
  });
