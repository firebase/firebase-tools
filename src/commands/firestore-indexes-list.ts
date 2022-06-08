import { Command } from "../command.js";
import * as clc from "cli-color";
import * as fsi from "../firestore/indexes.js";
import { logger } from "../logger.js";
import { requirePermissions } from "../requirePermissions.js";
import { Emulators } from "../emulator/types.js";
import { warnEmulatorNotSupported } from "../emulator/commandUtils.js";

export const command = new Command("firestore:indexes")
  .description("List indexes in your project's Cloud Firestore database.")
  .option(
    "--pretty",
    "Pretty print. When not specified the indexes are printed in the " +
      "JSON specification format."
  )
  .before(requirePermissions, ["datastore.indexes.list"])
  .before(warnEmulatorNotSupported, Emulators.FIRESTORE)
  .action(async (options: any) => {
    const indexApi = new fsi.FirestoreIndexes();

    const indexes = await indexApi.listIndexes(options.project);
    const fieldOverrides = await indexApi.listFieldOverrides(options.project);

    const indexSpec = indexApi.makeIndexSpec(indexes, fieldOverrides);

    if (options.pretty) {
      logger.info(clc.bold.white("Compound Indexes"));
      indexApi.prettyPrintIndexes(indexes);

      if (fieldOverrides) {
        logger.info();
        logger.info(clc.bold.white("Field Overrides"));
        indexApi.printFieldOverrides(fieldOverrides);
      }
    } else {
      logger.info(JSON.stringify(indexSpec, undefined, 2));
    }

    return indexSpec;
  });
