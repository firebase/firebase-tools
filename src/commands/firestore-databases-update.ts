import { Command } from "../command";
import * as clc from "colorette";
import * as fsi from "../firestore/api";
import * as types from "../firestore/api-types";
import { logger } from "../logger";
import { requirePermissions } from "../requirePermissions";
import { Emulators } from "../emulator/types";
import { warnEmulatorNotSupported } from "../emulator/commandUtils";
import { FirestoreOptions } from "../firestore/options";

export const command = new Command("firestore:databases:update")
  .description(
    "Update a database in your Firebase project. Must specify at least one property to update."
  )
  .option(
    "--pretty",
    "Pretty print. When not specified the databases are printed in the " +
      "JSON specification format."
  )
  .option("--database <databaseId>", "Name of database to be updated. (required)")
  .option(
    "--type <type>",
    "Type of database to update, for example 'DATASTORE_MODE' or 'FIRESTORE_NATIVE'."
  )
  .option(
    "--deleteProtectionState <deleteProtectionState>",
    "Whether or not to prevent deletion of database, for example 'DELETE_PROTECTION_ENABLED' or 'DELETE_PROTECTION_DISABLED'."
  )
  .before(requirePermissions, ["datastore.databases.update"])
  .before(warnEmulatorNotSupported, Emulators.FIRESTORE)
  .action(async (options: FirestoreOptions) => {
    const api = new fsi.FirestoreApi();

    if (!options.database) {
      logger.error(
        "Missing required flag --database. See firebase firestore:databases:update --help for more info."
      );
      return;
    }
    if (!options.type && !options.deleteProtectionState) {
      logger.error(
        "Missing properties to update. See firebase firestore:databases:update --help for more info."
      );
      return;
    }
    if (options.type && options.type != "DATASTORE_MODE" && options.type != "FIRESTORE_NATIVE") {
      logger.error(
        "Invalid value for flag --type. See firebase firestore:databases:update --help for more info."
      );
      return;
    }
    const type: types.DatabaseType = options.type || types.DatabaseType.FIRESTORE_NATIVE;
    if (
      options.deleteProtectionState &&
      options.deleteProtectionState != "DELETE_PROTECTION_ENABLED" &&
      options.deleteProtectionState != "DELETE_PROTECTION_DISABLED"
    ) {
      logger.error(
        "Invalid value for flag --deleteProtectionState. See firebase firestore:databases:update --help for more info."
      );
      return;
    }
    const deleteProtectionState: types.DatabaseDeleteProtectionState =
      options.deleteProtectionState || types.DatabaseDeleteProtectionState.DISABLED;

    const database: types.DatabaseResp = await api.updateDatabase(
      options.project,
      options.database,
      type,
      deleteProtectionState
    );

    logger.info(clc.bold(clc.white("Firestore Database Updated:")));
    if (options.pretty) {
      api.prettyPrintDatabases([database]);
    } else {
      logger.info(JSON.stringify(database, undefined, 2));
    }

    return database;
  });
