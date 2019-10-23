import * as Command from "../command";
import * as logger from "../logger";
import * as requireInstance from "../requireInstance";
import * as requirePermissions from "../requirePermissions";
import * as metadata from "../database/metadata";

export default new Command("database:rules:getlabels")
  .description("fetch current realtime database ruleset labels")
  .option(
    "--instance <instance>",
    "use the database <instance>.firebaseio.com (if omitted, uses default database instance)"
  )
  .before(requirePermissions, ["firebasedatabase.instances.get"])
  .before(requireInstance)
  .action(async (options: any) => {
    const labels = await metadata.getRulesetLabels(options.instance);
    logger.info(`stable = ${labels.stable}`);
    logger.info(`canary = ${labels.canary}`);
    return labels;
  });
