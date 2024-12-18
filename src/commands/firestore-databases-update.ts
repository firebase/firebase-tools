import * as clc from "colorette";

import { Command } from "../command.js";
import * as fsi from "../firestore/api.js";
import * as types from "../firestore/api-types.js";
import { logger } from "../logger.js";
import { requirePermissions } from "../requirePermissions.js";
import { Emulators } from "../emulator/types.js";
import { warnEmulatorNotSupported } from "../emulator/commandUtils.js";
import { FirestoreOptions } from "../firestore/options.js";
import { PrettyPrint } from "../firestore/pretty-print.js";
import { FirebaseError } from "../error.js";

export const command = new Command("firestore:databases:update <database>")
  .description(
    "Update a database in your Firebase project. Must specify at least one property to update.",
  )
  .option("--json", "Prints raw json response of the create API call if specified")
  .option(
    "--delete-protection <deleteProtectionState>",
    "Whether or not to prevent deletion of database, for example 'ENABLED' or 'DISABLED'. Default is 'DISABLED'",
  )
  .option(
    "--point-in-time-recovery <enablement>",
    "Whether to enable the PITR feature on this database, for example 'ENABLED' or 'DISABLED'. Default is 'DISABLED'",
  )
  .before(requirePermissions, ["datastore.databases.update"])
  .before(warnEmulatorNotSupported, Emulators.FIRESTORE)
  .action(async (database: string, options: FirestoreOptions) => {
    const api = new fsi.FirestoreApi();
    const printer = new PrettyPrint();
    const helpCommandText = "See firebase firestore:databases:update --help for more info.";

    if (!options.deleteProtection && !options.pointInTimeRecovery) {
      throw new FirebaseError(`Missing properties to update. ${helpCommandText}`);
    }
    if (
      options.deleteProtection &&
      options.deleteProtection !== types.DatabaseDeleteProtectionStateOption.ENABLED &&
      options.deleteProtection !== types.DatabaseDeleteProtectionStateOption.DISABLED
    ) {
      throw new FirebaseError(`Invalid value for flag --delete-protection. ${helpCommandText}`);
    }
    let deleteProtectionState: types.DatabaseDeleteProtectionState | undefined;
    if (options.deleteProtection === types.DatabaseDeleteProtectionStateOption.ENABLED) {
      deleteProtectionState = types.DatabaseDeleteProtectionState.ENABLED;
    } else if (options.deleteProtection === types.DatabaseDeleteProtectionStateOption.DISABLED) {
      deleteProtectionState = types.DatabaseDeleteProtectionState.DISABLED;
    }

    if (
      options.pointInTimeRecovery &&
      options.pointInTimeRecovery !== types.PointInTimeRecoveryEnablementOption.ENABLED &&
      options.pointInTimeRecovery !== types.PointInTimeRecoveryEnablementOption.DISABLED
    ) {
      throw new FirebaseError(
        `Invalid value for flag --point-in-time-recovery. ${helpCommandText}`,
      );
    }
    let pointInTimeRecoveryEnablement: types.PointInTimeRecoveryEnablement | undefined;
    if (options.pointInTimeRecovery === types.PointInTimeRecoveryEnablementOption.ENABLED) {
      pointInTimeRecoveryEnablement = types.PointInTimeRecoveryEnablement.ENABLED;
    } else if (options.pointInTimeRecovery === types.PointInTimeRecoveryEnablementOption.DISABLED) {
      pointInTimeRecoveryEnablement = types.PointInTimeRecoveryEnablement.DISABLED;
    }

    const databaseResp: types.DatabaseResp = await api.updateDatabase(
      options.project,
      database,
      deleteProtectionState,
      pointInTimeRecoveryEnablement,
    );

    if (options.json) {
      logger.info(JSON.stringify(databaseResp, undefined, 2));
    } else {
      logger.info(clc.bold(`Successfully updated ${printer.prettyDatabaseString(databaseResp)}`));
    }

    return databaseResp;
  });
