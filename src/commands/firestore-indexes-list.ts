import * as clc from "colorette";

import { Command } from "../command";
import * as fsi from "../firestore/api";
import { logger } from "../logger";
import { requirePermissions } from "../requirePermissions";
import { Emulators } from "../emulator/types";
import { warnEmulatorNotSupported } from "../emulator/commandUtils";
import { FirestoreOptions } from "../firestore/options";
import { PrettyPrint } from "../firestore/pretty-print";
import { needProjectId } from "../projectUtils";

export const command = new Command("firestore:indexes")
  .description("list indexes in a Cloud Firestore database")
  .option(
    "--pretty",
    "pretty print the indexes. When not specified the indexes are printed in the " +
      "JSON specification format",
  )
  .option(
    "--database <databaseId>",
    "database ID of the firestore database from which to list indexes. (default) if none provided",
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
