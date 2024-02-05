import { Command } from "../command";
import * as clc from "colorette";
import * as fsi from "../firestore/api";
import * as types from "../firestore/api-types";
import { logger } from "../logger";
import { requirePermissions } from "../requirePermissions";
import { Emulators } from "../emulator/types";
import { warnEmulatorNotSupported } from "../emulator/commandUtils";
import { FirestoreOptions } from "../firestore/options";

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

    if (!options.deleteProtection && !options.pointInTimeRecovery) {
      logger.error(
        "Missing properties to update. See firebase firestore:databases:update --help for more info.",
      );
      return;
    }
    if (
      options.deleteProtection &&
      options.deleteProtection !== types.DatabaseDeleteProtectionStateOption.ENABLED &&
      options.deleteProtection !== types.DatabaseDeleteProtectionStateOption.DISABLED
    ) {
      logger.error(
        "Invalid value for flag --delete-protection. See firebase firestore:databases:update --help for more info.",
      );
      return;
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
      logger.error(
        "Invalid value for flag --point-in-time-recovery. See firebase firestore:databases:update --help for more info.",
      );
      return;
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
      logger.info(clc.bold(`Successfully updated ${api.prettyDatabaseString(databaseResp)}`));
    }

    return databaseResp;
  });
