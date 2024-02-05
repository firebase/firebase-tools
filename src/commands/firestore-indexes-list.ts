import { Command } from "../command";
import * as clc from "colorette";
import * as fsi from "../firestore/api";
import { logger } from "../logger";
import { requirePermissions } from "../requirePermissions";
import { Emulators } from "../emulator/types";
import { warnEmulatorNotSupported } from "../emulator/commandUtils";
import { FirestoreOptions } from "../firestore/options";

export const command = new Command("firestore:indexes")
  .description("List indexes in your project's Cloud Firestore database.")
  .option(
    "--pretty",
    "Pretty print. When not specified the indexes are printed in the " +
      "JSON specification format.",
  )
  .option(
    "--database <databaseId>",
    "Database ID of the firestore database from which to list indexes. (default) if none provided.",
  )
  .before(requirePermissions, ["datastore.indexes.list"])
  .before(warnEmulatorNotSupported, Emulators.FIRESTORE)
  .action(async (options: FirestoreOptions) => {
    const indexApi = new fsi.FirestoreApi();

    const databaseId = options.database ?? "(default)";
    const indexes = await indexApi.listIndexes(options.project, databaseId);
    const fieldOverrides = await indexApi.listFieldOverrides(options.project, databaseId);

    const indexSpec = indexApi.makeIndexSpec(indexes, fieldOverrides);

    if (options.pretty) {
      logger.info(clc.bold(clc.white("Compound Indexes")));
      indexApi.prettyPrintIndexes(indexes);

      if (fieldOverrides) {
        logger.info();
        logger.info(clc.bold(clc.white("Field Overrides")));
        indexApi.printFieldOverrides(fieldOverrides);
      }
    } else {
      logger.info(JSON.stringify(indexSpec, undefined, 2));
    }

    return indexSpec;
  });
