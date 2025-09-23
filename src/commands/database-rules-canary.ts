import { Command } from "../command";
import { requirePermissions } from "../requirePermissions";
import * as metadata from "../database/metadata";
import { Emulators } from "../emulator/types";
import { warnEmulatorNotSupported } from "../emulator/commandUtils";
import { requireDatabaseInstance } from "../requireDatabaseInstance";

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
