import * as clc from "colorette";

import { Command } from "../command";
import * as fsi from "../firestore/api";
import * as types from "../firestore/api-types";
import { confirm } from "../prompt";
import { logger } from "../logger";
import { requirePermissions } from "../requirePermissions";
import { Emulators } from "../emulator/types";
import { warnEmulatorNotSupported } from "../emulator/commandUtils";
import { FirestoreOptions } from "../firestore/options";
import { FirebaseError } from "../error";
import { PrettyPrint } from "../firestore/pretty-print";

export const command = new Command("firestore:databases:delete <database>")
  .description("delete a database in your Cloud Firestore project")
  .withForce(
    "delete the database without prompting for confirmation (required with --non-interactive)",
  )
  .before(requirePermissions, ["datastore.databases.delete"])
  .before(warnEmulatorNotSupported, Emulators.FIRESTORE)
  .action(async (database: string, options: FirestoreOptions) => {
    const api = new fsi.FirestoreApi();
    const printer = new PrettyPrint();

    const databasePath = `projects/${options.project}/databases/${database}`;
    if (!options.force && options.nonInteractive) {
      throw new FirebaseError(
        `Deleting ${databasePath} requires confirmation. Pass --force to delete the database in non-interactive mode.`,
      );
    }
    const consent = await confirm({
      message: `You are about to delete ${databasePath}. Do you wish to continue?`,
      default: false,
      nonInteractive: options.nonInteractive,
      force: options.force,
    });
    if (!consent) {
      throw new FirebaseError("Delete database canceled. Pass --force to skip this prompt.");
    }

    const databaseResp: types.DatabaseResp = await api.deleteDatabase(options.project, database);

    logger.info(clc.bold(`Successfully deleted ${printer.prettyDatabaseString(databaseResp)}`));

    return databaseResp;
  });
