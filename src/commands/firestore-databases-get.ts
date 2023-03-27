import { Command } from "../command";
import * as clc from "colorette";
import * as fsi from "../firestore/api";
import * as types from "../firestore/api-types";
import { logger } from "../logger";
import { requirePermissions } from "../requirePermissions";
import { Emulators } from "../emulator/types";
import { warnEmulatorNotSupported } from "../emulator/commandUtils";
import { FirestoreOptions } from "../firestore/options";

export const command = new Command("firestore:databases:get")
  .description("Get database in your Cloud Firestore project.")
  .option(
    "--pretty",
    "Pretty print. When not specified the database is printed in the " +
      "JSON specification format."
  )
  .option(
    "--database <databaseId>",
    "Database ID of the firestore database from which to list configuration. (default) if none provided."
  )
  .before(requirePermissions, ["datastore.databases.get"])
  .before(warnEmulatorNotSupported, Emulators.FIRESTORE)
  .action(async (options: FirestoreOptions) => {
    const api = new fsi.FirestoreApi();

    const databaseId = options.database || "(default)";
    const database: types.DatabaseResp = await api.getDatabase(options.project, databaseId);

    if (options.pretty) {
      logger.info(clc.bold(clc.white("Firestore Databases")));
      api.prettyPrintDatabases([database]);
    } else {
      logger.info(JSON.stringify(database, undefined, 2));
    }

    return database;
  });
