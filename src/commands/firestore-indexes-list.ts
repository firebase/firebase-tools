import * as clc from "colorette";

import { Command } from "../command.js";
import * as fsi from "../firestore/api.js";
import { logger } from "../logger.js";
import { requirePermissions } from "../requirePermissions.js";
import { Emulators } from "../emulator/types.js";
import { warnEmulatorNotSupported } from "../emulator/commandUtils.js";
import { FirestoreOptions } from "../firestore/options.js";
import { PrettyPrint } from "../firestore/pretty-print.js";
import { needProjectId } from "../projectUtils.js";

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
    const printer = new PrettyPrint();

    const databaseId = options.database ?? "(default)";
    const projectId = needProjectId(options);
    const indexes = await indexApi.listIndexes(projectId, databaseId);
    const fieldOverrides = await indexApi.listFieldOverrides(projectId, databaseId);

    const indexSpec = indexApi.makeIndexSpec(indexes, fieldOverrides);

    if (options.pretty) {
      logger.info(clc.bold(clc.white("Compound Indexes")));
      printer.prettyPrintIndexes(indexes);

      if (fieldOverrides) {
        logger.info();
        logger.info(clc.bold(clc.white("Field Overrides")));
        printer.printFieldOverrides(fieldOverrides);
      }
    } else {
      logger.info(JSON.stringify(indexSpec, undefined, 2));
    }

    return indexSpec;
  });
