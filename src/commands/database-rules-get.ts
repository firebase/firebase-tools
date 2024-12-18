import { Command } from "../command.js";
import { logger } from "../logger.js";
import { requireDatabaseInstance } from "../requireDatabaseInstance.js";
import { requirePermissions } from "../requirePermissions.js";
import * as metadata from "../database/metadata.js";
import { Emulators } from "../emulator/types.js";
import { warnEmulatorNotSupported } from "../emulator/commandUtils.js";

export const command = new Command("database:rules:get <rulesetId>")
  .description("get a realtime database ruleset by id")
  .option(
    "--instance <instance>",
    "use the database <instance>.firebaseio.com (if omitted, uses default database instance)",
  )
  .before(requirePermissions, ["firebasedatabase.instances.get"])
  .before(requireDatabaseInstance)
  .before(warnEmulatorNotSupported, Emulators.DATABASE)
  .action(async (rulesetId: metadata.RulesetId, options: any) => {
    const ruleset = await metadata.getRuleset(options.instance, rulesetId);
    logger.info(`Ruleset ${ruleset.id} was created at ${ruleset.createdAt}`);
    logger.info(ruleset.source);
    return ruleset;
  });
