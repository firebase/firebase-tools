import * as Command from "../command";
import * as logger from "../logger";
import * as requireInstance from "../requireInstance";
import * as requirePermissions from "../requirePermissions";
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
    await metadata.setRulesetLabels(options.instance, {
      stable: rulesetId,
    });
    return null;
  });
