import { Command } from "../command";
import { logger } from "../logger";
import { requireDatabaseInstance } from "../requireDatabaseInstance";
import { requirePermissions } from "../requirePermissions";
import * as metadata from "../database/metadata";
import * as fs from "fs-extra";
import * as path from "path";
import { Emulators } from "../emulator/types";
import { warnEmulatorNotSupported } from "../emulator/commandUtils";

export const command = new Command("database:rules:stage")
  .description("create a new realtime database ruleset")
  .option(
    "--instance <instance>",
    "use the database <instance>.firebaseio.com (if omitted, uses default database instance)",
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
