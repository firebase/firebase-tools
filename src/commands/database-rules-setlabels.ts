import * as Command from "../command";
import * as logger from "../logger";
import * as requireInstance from "../requireInstance";
import * as requirePermissions from "../requirePermissions";
import * as metadata from "../database/metadata";

export default new Command("database:rules:setlabels")
  .description("list realtime database rulesets")
  .option(
    "--instance <instance>",
    "use the database <instance>.firebaseio.com (if omitted, uses default database instance)"
  )
  .option("--stable <ruleset_id>", "mark the given ruleset id as 'stable'")
  .option("--canary <ruleset_id>", "mark the given ruleset id as 'canary'")
  .before(requirePermissions, ["firebasedatabase.instances.get"])
  .before(requireInstance)
  .action(async (options: any) => {
    await metadata.setRulesetLabels(options.instance, {
      stable: options.stable,
      canary: options.canary,
    });
    return null;
  });
