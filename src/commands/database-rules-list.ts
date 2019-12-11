import { Command } from "../command";
import * as logger from "../logger";
import * as requireInstance from "../requireInstance";
import {requirePermissions} from "../requirePermissions";
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
    const labeled = await metadata.getRulesetLabels(options.instance);
    const rulesets = await metadata.listAllRulesets(options.instance);
    for (const ruleset of rulesets) {
      const labels = [];
      if (ruleset.id == labeled.stable) {
        labels.push("stable");
      }
      if (ruleset.id == labeled.canary) {
        labels.push("canary");
      }
      logger.info(`${ruleset.id}  ${ruleset.createdAt} ${labels.join(',')}`);
    }
    logger.info("Labels:")
    logger.info(`  stable: ${labeled.stable}`);
    if (labeled.canary) {
      logger.info(`  canary: ${labeled.canary}`);
    }
    return { rulesets, labeled };
  });
