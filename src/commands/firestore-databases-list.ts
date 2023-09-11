import { Command } from "../command";
import * as fsi from "../firestore/api";
import * as types from "../firestore/api-types";
import { logger } from "../logger";
import { requirePermissions } from "../requirePermissions";
import { Emulators } from "../emulator/types";
import { warnEmulatorNotSupported } from "../emulator/commandUtils";
import { FirestoreOptions } from "../firestore/options";

export const command = new Command("firestore:databases:list")
  .description("List databases in your Cloud Firestore project.")
  .before(requirePermissions, ["datastore.databases.list"])
  .before(warnEmulatorNotSupported, Emulators.FIRESTORE)
  .action(async (options: FirestoreOptions) => {
    const api = new fsi.FirestoreApi();

    const databases: types.DatabaseResp[] = await api.listDatabases(options.project);

    if (options.json) {
      logger.info(JSON.stringify(databases, undefined, 2));
    } else {
      api.prettyPrintDatabases(databases);
    }

    return databases;
  });
