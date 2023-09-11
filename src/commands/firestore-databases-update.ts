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
    "Update a database in your Firebase project. Must specify at least one property to update."
  )
  .option("--json", "Prints raw json response of the create API call if specified")
  .option(
    "--delete-protection <deleteProtectionState>",
    "Whether or not to prevent deletion of database, for example 'ENABLED' or 'DISABLED'. Default is 'DISABLED'"
  )
  .before(requirePermissions, ["datastore.databases.update"])
  .before(warnEmulatorNotSupported, Emulators.FIRESTORE)
  .action(async (database: string, options: FirestoreOptions) => {
    const api = new fsi.FirestoreApi();

    if (!options.type && !options.deleteProtection) {
      logger.error(
        "Missing properties to update. See firebase firestore:databases:update --help for more info."
      );
      return;
    }
    const type: types.DatabaseType = types.DatabaseType.FIRESTORE_NATIVE;
    if (
      options.deleteProtection &&
      options.deleteProtection !== types.DatabaseDeleteProtectionStateOption.ENABLED &&
      options.deleteProtection !== types.DatabaseDeleteProtectionStateOption.DISABLED
    ) {
      logger.error(
        "Invalid value for flag --delete-protection. See firebase firestore:databases:update --help for more info."
      );
      return;
    }
    const deleteProtectionState: types.DatabaseDeleteProtectionState =
      options.deleteProtection === types.DatabaseDeleteProtectionStateOption.ENABLED
        ? types.DatabaseDeleteProtectionState.ENABLED
        : types.DatabaseDeleteProtectionState.DISABLED;

    const databaseResp: types.DatabaseResp = await api.updateDatabase(
      options.project,
      database,
      type,
      deleteProtectionState
    );

    if (options.json) {
      logger.info(JSON.stringify(databaseResp, undefined, 2));
    } else {
      logger.info(clc.bold(`Successfully updated ${api.prettyDatabaseString(databaseResp)}`));
    }

    return databaseResp;
  });
