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
  .description("Create a database in your Cloud Firestore project.")
  .option(
    "--pretty",
    "Pretty print. When not specified the indexes are printed in the " +
      "JSON specification format."
  )
  .option("--database <databaseId>", "Name of database to be created. (mandatory).")
  .option(
    "--location <locationId>",
    "Region to create database, for example 'nam5'. Run 'firebase firestore:locations --pretty' to get a list of eligible locations. (mandatory)"
  )
  .option(
    "--type <type>",
    "Type of database to create, for example 'DATASTORE_MODE' or 'FIRESTORE_NATIVE'. Default is 'FIRESTORE_NATIVE'"
  )
  .before(requirePermissions, ["datastore.databases.create"])
  .before(warnEmulatorNotSupported, Emulators.FIRESTORE)
  .action(async (options: FirestoreOptions) => {
    const api = new fsi.FirestoreApi();

    if (!options.database) {
      logger.error(
        "Database name must be provided. See firebase firestore:databases:create --help for more info."
      );
      return;
    }
    if (!options.location) {
      logger.error(
        "Location must be provided. See firebase firestore:databases:create --help for more info."
      );
      return;
    }
    const type = options.type || "FIRESTORE_NATIVE";
    const database: types.DatabaseResp = await api.createDatabase(
      options.project,
      options.database,
      options.location,
      type
    );

    logger.info(clc.bold(clc.white("Firestore Database Created:")));
    if (options.pretty) {
      api.prettyPrintDatabases([database]);
    } else {
      logger.info(JSON.stringify(database, undefined, 2));
    }

    return database;
  });
