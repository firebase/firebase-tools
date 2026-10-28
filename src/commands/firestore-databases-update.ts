import * as clc from "colorette";

import { Command } from "../command";
import * as experiments from "../experiments";
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
    "update a database in your Firebase project. Must specify at least one property to update",
  )
  .option("--json", "prints raw json response of the create API call if specified")
  .option(
    "--delete-protection <deleteProtectionState>",
    "whether or not to prevent deletion of database, for example 'ENABLED' or 'DISABLED'. Default is 'DISABLED'",
  )
  .option(
    "--point-in-time-recovery <enablement>",
    "whether to enable the PITR feature on this database, for example 'ENABLED' or 'DISABLED'. Default is 'DISABLED'",
  );

if (experiments.isEnabled("firestorewatchmutability")) {
  command.option(
    "--realtime-updates <enablement>",
    "whether realtime updates are enabled for this database, for example 'ENABLED' or 'DISABLED'",
  );
}

command
  .before(requirePermissions, ["datastore.databases.update"])
  .before(warnEmulatorNotSupported, Emulators.FIRESTORE)
  .action(async (database: string, options: FirestoreOptions) => {
    const api = new fsi.FirestoreApi();
    const printer = new PrettyPrint();
    const helpCommandText = "See firebase firestore:databases:update --help for more info.";

    if (!options.deleteProtection && !options.pointInTimeRecovery && !options.realtimeUpdates) {
      throw new FirebaseError(`Missing properties to update. ${helpCommandText}`);
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

    types.validateEnablementOption(options.realtimeUpdates, "realtime-updates", helpCommandText);
    let realtimeUpdatesMode: types.RealtimeUpdatesMode | undefined;
    if (options.realtimeUpdates === types.EnablementOption.ENABLED) {
      realtimeUpdatesMode = types.RealtimeUpdatesMode.ENABLED;
    } else if (options.realtimeUpdates === types.EnablementOption.DISABLED) {
      realtimeUpdatesMode = types.RealtimeUpdatesMode.DISABLED;
    }

    const operation: types.Operation = await api.updateDatabase(options.project, database, {
      deleteProtectionState,
      pointInTimeRecoveryEnablement,
      realtimeUpdatesMode,
    });

    if (operation.error) {
      throw new FirebaseError(`Failed to update database ${database}: ${operation.error.message}`);
    }
    if (!operation.done) {
      logUpdateInProgress(database, operation);
      return operation;
    }
    const databaseResp = operation.response as types.DatabaseResp | undefined;
    if (!databaseResp) {
      throw new FirebaseError("Not found");
    }

    logger.info(clc.bold(`Successfully updated ${printer.prettyDatabaseString(databaseResp)}`));

    return databaseResp;
  });

function logUpdateInProgress(database: string, operation: types.Operation): void {
  logger.info(clc.bold(`Successfully initiated update of database ${database}.`));
  logger.info();
  logger.info("You can monitor the progress of this update by executing this command:");
  logger.info();
  logger.info(`firebase firestore:operations:describe --database="${database}" ${operation.name}`);
}
