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

export const command = new Command("firestore:databases:delete <database>")
  .description(
    "Delete a database in your Cloud Firestore project. Database delete protection state must be disabled. To do so, use the update command: firebase firestore:databases:update <database> --delete-protection DISABLED",
  )
  .option("--force", "Attempt to delete database without prompting for confirmation.")
  .before(requirePermissions, ["datastore.databases.delete"])
  .before(warnEmulatorNotSupported, Emulators.FIRESTORE)
  .action(async (database: string, options: FirestoreOptions) => {
    const api = new fsi.FirestoreApi();

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
      logger.info(clc.bold(`Successfully deleted ${api.prettyDatabaseString(databaseResp)}`));
    }

    return databaseResp;
  });
