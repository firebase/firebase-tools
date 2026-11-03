import * as clc from "colorette";

import { Command } from "../command";
import * as fsi from "../firestore/api";
import * as types from "../firestore/api-types";
import { logger } from "../logger";
import { requirePermissions } from "../requirePermissions";
import { Emulators } from "../emulator/types";
import { warnEmulatorNotSupported } from "../emulator/commandUtils";
import { FirestoreOptions } from "../firestore/options";
import { PrettyPrint } from "../firestore/pretty-print";
import { FirebaseError } from "../error";

export const command = new Command("firestore:databases:update <database>")
  .description(
    "update the delete protection or point-in-time recovery (PITR) setting of a Cloud Firestore database. Specify at least one of --delete-protection or --point-in-time-recovery; omitted settings are left unchanged",
  )
  .option(
    "--delete-protection <deleteProtectionState>",
    "whether to prevent deletion of the database: 'ENABLED' or 'DISABLED'. If omitted, the current setting is unchanged",
  )
  .option(
    "--point-in-time-recovery <enablement>",
    "whether to enable point-in-time recovery (PITR) on the database: 'ENABLED' or 'DISABLED'. If omitted, the current setting is unchanged",
  )
  .before(requirePermissions, ["datastore.databases.update"])
  .before(warnEmulatorNotSupported, Emulators.FIRESTORE)
  .action(async (database: string, options: FirestoreOptions) => {
    const api = new fsi.FirestoreApi();
    const printer = new PrettyPrint();
    const helpCommandText = "See firebase firestore:databases:update --help for more info.";

    if (!options.deleteProtection && !options.pointInTimeRecovery) {
      throw new FirebaseError(
        `Missing properties to update. Specify at least one of --delete-protection or --point-in-time-recovery. ${helpCommandText}`,
      );
    }

    types.validateEnablementOption(options.deleteProtection, "delete-protection", helpCommandText);
    let deleteProtectionState: types.DatabaseDeleteProtectionState | undefined;
    if (options.deleteProtection === types.EnablementOption.ENABLED) {
      deleteProtectionState = types.DatabaseDeleteProtectionState.ENABLED;
    } else if (options.deleteProtection === types.EnablementOption.DISABLED) {
      deleteProtectionState = types.DatabaseDeleteProtectionState.DISABLED;
    }

    types.validateEnablementOption(
      options.pointInTimeRecovery,
      "point-in-time-recovery",
      helpCommandText,
    );
    let pointInTimeRecoveryEnablement: types.PointInTimeRecoveryEnablement | undefined;
    if (options.pointInTimeRecovery === types.EnablementOption.ENABLED) {
      pointInTimeRecoveryEnablement = types.PointInTimeRecoveryEnablement.ENABLED;
    } else if (options.pointInTimeRecovery === types.EnablementOption.DISABLED) {
      pointInTimeRecoveryEnablement = types.PointInTimeRecoveryEnablement.DISABLED;
    }

    const databaseResp: types.DatabaseResp = await api.updateDatabase(
      options.project,
      database,
      deleteProtectionState,
      pointInTimeRecoveryEnablement,
    );

    logger.info(clc.bold(`Successfully updated ${printer.prettyDatabaseString(databaseResp)}`));

    return databaseResp;
  });
