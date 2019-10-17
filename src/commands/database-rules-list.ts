import * as Command from "../command";
import * as logger from "../logger";
import * as requireInstance from "../requireInstance";
import * as requirePermissions from "../requirePermissions";
import * as metadata from "../database/metadata";

export default new Command("database:rules:list")
  .description("list realtime database rulesets")
  .option(
    "--instance <instance>",
    "use the database <instance>.firebaseio.com (if omitted, uses default database instance)"
  )
  .before(requirePermissions, ["firebasedatabase.instances.get"])
  .before(requireInstance)
  .action(async (options: any) => {
    const databaseName = "ryanpbrewster-test";
    const rulesets = await metadata.listAllRulesets(databaseName);
    for (const ruleset of rulesets) {
      logger.info(ruleset.id);
    }
    logger.info(`Database ${databaseName} has ${rulesets.length} rulesets`);
    return rulesets;
  });
