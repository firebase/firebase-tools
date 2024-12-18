import { Command } from "../command.js";
import * as fsi from "../firestore/api.js";
import * as types from "../firestore/api-types.js";
import { logger } from "../logger.js";
import { requirePermissions } from "../requirePermissions.js";
import { Emulators } from "../emulator/types.js";
import { warnEmulatorNotSupported } from "../emulator/commandUtils.js";
import { FirestoreOptions } from "../firestore/options.js";
import { PrettyPrint } from "../firestore/pretty-print.js";

export const command = new Command("firestore:databases:list")
  .description("List databases in your Cloud Firestore project.")
  .before(requirePermissions, ["datastore.databases.list"])
  .before(warnEmulatorNotSupported, Emulators.FIRESTORE)
  .action(async (options: FirestoreOptions) => {
    const api = new fsi.FirestoreApi();
    const printer = new PrettyPrint();

    const databases: types.DatabaseResp[] = await api.listDatabases(options.project);

    if (options.json) {
      logger.info(JSON.stringify(databases, undefined, 2));
    } else {
      printer.prettyPrintDatabases(databases);
    }

    return databases;
  });
