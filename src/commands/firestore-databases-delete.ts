import * as clc from "colorette";

import { Command } from "../command.js";
import * as fsi from "../firestore/api.js";
import * as types from "../firestore/api-types.js";
import { promptOnce } from "../prompt.js";
import { logger } from "../logger.js";
import { requirePermissions } from "../requirePermissions.js";
import { Emulators } from "../emulator/types.js";
import { warnEmulatorNotSupported } from "../emulator/commandUtils.js";
import { FirestoreOptions } from "../firestore/options.js";
import { FirebaseError } from "../error.js";
import { PrettyPrint } from "../firestore/pretty-print.js";

export const command = new Command("firestore:databases:delete <database>")
  .description(
    "Delete a database in your Cloud Firestore project. Database delete protection state must be disabled. To do so, use the update command: firebase firestore:databases:update <database> --delete-protection DISABLED",
  )
  .option("--force", "Attempt to delete database without prompting for confirmation.")
  .before(requirePermissions, ["datastore.databases.delete"])
  .before(warnEmulatorNotSupported, Emulators.FIRESTORE)
  .action(async (database: string, options: FirestoreOptions) => {
    const api = new fsi.FirestoreApi();
    const printer = new PrettyPrint();

    if (!options.force) {
      const confirmMessage = `You are about to delete projects/${options.project}/databases/${database}. Do you wish to continue?`;
      const consent = await promptOnce({
        type: "confirm",
        message: confirmMessage,
        default: false,
      });
      if (!consent) {
        throw new FirebaseError("Delete database canceled.");
      }
    }

    const databaseResp: types.DatabaseResp = await api.deleteDatabase(options.project, database);

    if (options.json) {
      logger.info(JSON.stringify(databaseResp, undefined, 2));
    } else {
      logger.info(clc.bold(`Successfully deleted ${printer.prettyDatabaseString(databaseResp)}`));
    }

    return databaseResp;
  });
