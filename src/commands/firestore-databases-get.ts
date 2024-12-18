import { Command } from "../command.js";
import * as fsi from "../firestore/api.js";
import * as types from "../firestore/api-types.js";
import { logger } from "../logger.js";
import { requirePermissions } from "../requirePermissions.js";
import { Emulators } from "../emulator/types.js";
import { warnEmulatorNotSupported } from "../emulator/commandUtils.js";
import { FirestoreOptions } from "../firestore/options.js";
import { PrettyPrint } from "../firestore/pretty-print.js";

export const command = new Command("firestore:databases:get [database]")
  .description("Get database in your Cloud Firestore project.")
  .before(requirePermissions, ["datastore.databases.get"])
  .before(warnEmulatorNotSupported, Emulators.FIRESTORE)
  .action(async (database: string, options: FirestoreOptions) => {
    const api = new fsi.FirestoreApi();
    const printer = new PrettyPrint();

    const databaseId = database || "(default)";
    const databaseResp: types.DatabaseResp = await api.getDatabase(options.project, databaseId);

    if (options.json) {
      logger.info(JSON.stringify(databaseResp, undefined, 2));
    } else {
      printer.prettyPrintDatabase(databaseResp);
    }

    return databaseResp;
  });
