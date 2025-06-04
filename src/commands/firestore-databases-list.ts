import { Command } from "../command";
import * as fsi from "../firestore/api";
import * as types from "../firestore/api-types";
import { logger } from "../logger";
import { requirePermissions } from "../requirePermissions";
import { Emulators } from "../emulator/types";
import { warnEmulatorNotSupported } from "../emulator/commandUtils";
import { FirestoreOptions } from "../firestore/options";
import { PrettyPrint } from "../firestore/pretty-print";

export const command = new Command("firestore:databases:list")
  .description("list the Cloud Firestore databases on your project")
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
