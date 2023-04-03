import { Command } from "../command";
import * as clc from "colorette";
import * as fsi from "../firestore/api";
import * as types from "../firestore/api-types";
import { logger } from "../logger";
import { requirePermissions } from "../requirePermissions";
import { Emulators } from "../emulator/types";
import { warnEmulatorNotSupported } from "../emulator/commandUtils";
import { FirestoreOptions } from "../firestore/options";

export const command = new Command("firestore:databases:create")
  .description("Create a database in your Firebase project.")
  .option(
    "--pretty",
    "Pretty print. When not specified the databases are printed in the " +
      "JSON specification format."
  )
  .option("--database <databaseId>", "Name of database to be created. (required)")
  .option(
    "--location <locationId>",
    "Region to create database, for example 'nam5'. Run 'firebase firestore:locations --pretty' to get a list of eligible locations. (required)"
  )
  .option(
    "--type <type>",
    "Type of database to create, for example 'DATASTORE_MODE' or 'FIRESTORE_NATIVE'. Default is 'FIRESTORE_NATIVE'"
  )
  .option(
    "--deleteProtectionState <deleteProtectionState>",
    "Whether or not to prevent deletion of database, for example 'DELETE_PROTECTION_ENABLED' or 'DELETE_PROTECTION_DISABLED'. Default is 'DELETE_PROTECTION_DISABLED'"
  )
  .before(requirePermissions, ["datastore.databases.create"])
  .before(warnEmulatorNotSupported, Emulators.FIRESTORE)
  .action(async (options: FirestoreOptions) => {
    const api = new fsi.FirestoreApi();

    if (!options.database) {
      logger.error(
        "Missing required flag --database. See firebase firestore:databases:create --help for more info."
      );
      return;
    }
    if (!options.location) {
      logger.error(
        "Missing required flag --location. See firebase firestore:databases:create --help for more info."
      );
      return;
    }
    if (options.type && options.type !== "DATASTORE_MODE" && options.type !== "FIRESTORE_NATIVE") {
      logger.error(
        "Invalid value for flag --type. See firebase firestore:databases:create --help for more info."
      );
      return;
    }
    const type: types.DatabaseType = options.type ?? types.DatabaseType.FIRESTORE_NATIVE;
    if (
      options.deleteProtectionState &&
      options.deleteProtectionState !== "DELETE_PROTECTION_ENABLED" &&
      options.deleteProtectionState !== "DELETE_PROTECTION_DISABLED"
    ) {
      logger.error(
        "Invalid value for flag --deleteProtectionState. See firebase firestore:databases:create --help for more info."
      );
      return;
    }
    const deleteProtectionState: types.DatabaseDeleteProtectionState =
      options.deleteProtectionState ?? types.DatabaseDeleteProtectionState.DISABLED;

    const database: types.DatabaseResp = await api.createDatabase(
      options.project,
      options.database,
      options.location,
      type,
      deleteProtectionState
    );

    logger.info(clc.bold(clc.white("Firestore Database Created:")));
    if (options.pretty) {
      api.prettyPrintDatabases([database]);
    } else {
      logger.info(JSON.stringify(database, undefined, 2));
    }

    return database;
  });
