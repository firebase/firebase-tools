import { Command } from "../command.js";
import { logger } from "../logger.js";
import { requireDatabaseInstance } from "../requireDatabaseInstance.js";
import { requirePermissions } from "../requirePermissions.js";
import * as metadata from "../database/metadata.js";
import * as fs from "fs-extra";
import * as path from "path";
import { Emulators } from "../emulator/types.js";
import { warnEmulatorNotSupported } from "../emulator/commandUtils.js";

export const command = new Command("database:rules:stage")
  .description("create a new realtime database ruleset")
  .option(
    "--instance <instance>",
    "use the database <instance>.firebaseio.com (if omitted, uses default database instance)"
  )
  .before(requirePermissions, ["firebasedatabase.instances.update"])
  .before(requireDatabaseInstance)
  .before(warnEmulatorNotSupported, Emulators.DATABASE)
  .action(async (options: any) => {
    const filepath = options.config.data.database.rules;
    logger.info(`staging ruleset from ${filepath}`);
    const source = fs.readFileSync(path.resolve(filepath), "utf8");
    const rulesetId = await metadata.createRuleset(options.instance, source);
    logger.info(`staged ruleset ${rulesetId}`);
    return rulesetId;
  });
