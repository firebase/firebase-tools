import { Command } from "../command.js";
import { requirePermissions } from "../requirePermissions.js";
import * as metadata from "../database/metadata.js";
import { Emulators } from "../emulator/types.js";
import { warnEmulatorNotSupported } from "../emulator/commandUtils.js";
import { requireDatabaseInstance } from "../requireDatabaseInstance.js";

export const command = new Command("database:rules:canary <rulesetId>")
  .description("mark a staged ruleset as the canary ruleset")
  .option(
    "--instance <instance>",
    "use the database <instance>.firebaseio.com (if omitted, uses default database instance)",
  )
  .before(requirePermissions, ["firebasedatabase.instances.update"])
  .before(requireDatabaseInstance)
  .before(warnEmulatorNotSupported, Emulators.DATABASE)
  .action(async (rulesetId: string, options: any) => {
    const oldLabels = await metadata.getRulesetLabels(options.instance);
    const newLabels = {
      stable: oldLabels.stable,
      canary: rulesetId,
    };
    await metadata.setRulesetLabels(options.instance, newLabels);
    return newLabels;
  });
