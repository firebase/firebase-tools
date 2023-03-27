import { Command } from "../command";
import * as clc from "colorette";
import * as fsi from "../firestore/api";
import * as types from "../firestore/api-types";
import { promptOnce } from "../prompt";
import { logger } from "../logger";
import { requirePermissions } from "../requirePermissions";
import { Emulators } from "../emulator/types";
import { warnEmulatorNotSupported } from "../emulator/commandUtils";
import { FirestoreOptions } from "../firestore/options";
import { FirebaseError } from "../error";

export const command = new Command("firestore:databases:delete")
  .description("Delete a database in your Cloud Firestore project.")
  .option(
    "--pretty",
    "Pretty print. When not specified the databases are printed in the " +
      "JSON specification format."
  )
  .option(
    "--database <databaseId>",
    "Database ID of the firestore database to be deleted. (required)."
  )
  .before(requirePermissions, ["datastore.databases.delete"])
  .before(warnEmulatorNotSupported, Emulators.FIRESTORE)
  .action(async (options: FirestoreOptions) => {
    const api = new fsi.FirestoreApi();

    if (!options.database) {
      logger.error(
        "Database id must be provided. See firebase firestore:databases:delete --help for more info."
      );
      return;
    }
    if (!options.force) {
      const confirmMessage = `You are about to delete projects/${options.project}/databases/${options.database}. Do you wish to continue?`;
      const consent = await promptOnce({
        type: "confirm",
        message: confirmMessage,
        default: false,
      });
      if (!consent) {
        throw new FirebaseError("Delete database canceled.");
      }
    }

    const database: types.DatabaseResp = await api.deleteDatabase(
      options.project,
      options.database
    );

    logger.info(clc.bold(clc.white("Firestore Database Deleted:")));
    if (options.pretty) {
      api.prettyPrintDatabases([database]);
    } else {
      logger.info(JSON.stringify(database, undefined, 2));
    }

    return database;
  });
