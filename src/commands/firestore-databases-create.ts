import { Command } from "../command";
import * as clc from "colorette";
import * as fsi from "../firestore/api";
import * as types from "../firestore/api-types";
import { logger } from "../logger";
import { requirePermissions } from "../requirePermissions";
import { Emulators } from "../emulator/types";
import { warnEmulatorNotSupported } from "../emulator/commandUtils";
import { FirestoreOptions } from "../firestore/options";

export const command = new Command("firestore:databases:create <database>")
  .description("Create a database in your Firebase project.")
  .option(
    "--location <locationId>",
    "Region to create database, for example 'nam5'. Run 'firebase firestore:locations' to get a list of eligible locations. (required)",
  )
  .option(
    "--delete-protection <deleteProtectionState>",
    "Whether or not to prevent deletion of database, for example 'ENABLED' or 'DISABLED'. Default is 'DISABLED'",
  )
  .option(
    "--point-in-time-recovery <enablement>",
    "Whether to enable the PITR feature on this database, for example 'ENABLED' or 'DISABLED'. Default is 'DISABLED'",
  )
  .before(requirePermissions, ["datastore.databases.create"])
  .before(warnEmulatorNotSupported, Emulators.FIRESTORE)
  .action(async (database: string, options: FirestoreOptions) => {
    const api = new fsi.FirestoreApi();
    if (!options.location) {
      logger.error(
        "Missing required flag --location. See firebase firestore:databases:create --help for more info.",
      );
      return;
    }
    // Type is always Firestore Native since Firebase does not support Datastore Mode
    const type: types.DatabaseType = types.DatabaseType.FIRESTORE_NATIVE;
    if (
      options.deleteProtection &&
      options.deleteProtection !== types.DatabaseDeleteProtectionStateOption.ENABLED &&
      options.deleteProtection !== types.DatabaseDeleteProtectionStateOption.DISABLED
    ) {
      logger.error(
        "Invalid value for flag --delete-protection. See firebase firestore:databases:create --help for more info.",
      );
      return;
    }
    const deleteProtectionState: types.DatabaseDeleteProtectionState =
      options.deleteProtection === types.DatabaseDeleteProtectionStateOption.ENABLED
        ? types.DatabaseDeleteProtectionState.ENABLED
        : types.DatabaseDeleteProtectionState.DISABLED;

    if (
      options.pointInTimeRecovery &&
      options.pointInTimeRecovery !== types.PointInTimeRecoveryEnablementOption.ENABLED &&
      options.pointInTimeRecovery !== types.PointInTimeRecoveryEnablementOption.DISABLED
    ) {
      logger.error(
        "Invalid value for flag --point-in-time-recovery. See firebase firestore:databases:create --help for more info.",
      );
      return;
    }
    const pointInTimeRecoveryEnablement: types.PointInTimeRecoveryEnablement =
      options.pointInTimeRecovery === types.PointInTimeRecoveryEnablementOption.ENABLED
        ? types.PointInTimeRecoveryEnablement.ENABLED
        : types.PointInTimeRecoveryEnablement.DISABLED;

    const databaseResp: types.DatabaseResp = await api.createDatabase(
      options.project,
      database,
      options.location,
      type,
      deleteProtectionState,
      pointInTimeRecoveryEnablement,
    );

    if (options.json) {
      logger.info(JSON.stringify(databaseResp, undefined, 2));
    } else {
      logger.info(clc.bold(`Successfully created ${api.prettyDatabaseString(databaseResp)}`));
      logger.info(
        "Please be sure to configure Firebase rules in your Firebase config file for\n" +
          "the new database. By default, created databases will have closed rules that\n" +
          "block any incoming third-party traffic.",
      );
    }

    return databaseResp;
  });
