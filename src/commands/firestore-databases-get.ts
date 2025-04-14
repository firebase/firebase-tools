import { Command } from "../command";
import * as fsi from "../firestore/api";
import * as types from "../firestore/api-types";
import { logger } from "../logger";
import { requirePermissions } from "../requirePermissions";
import { Emulators } from "../emulator/types";
import { warnEmulatorNotSupported } from "../emulator/commandUtils";
import { FirestoreOptions } from "../firestore/options";
import { PrettyPrint } from "../firestore/pretty-print";

export const command = new Command("firestore:databases:get [database]")
  .description("get information about a Cloud Firestore database")
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
