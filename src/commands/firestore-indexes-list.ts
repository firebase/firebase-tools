import * as clc from "colorette";
import * as fs from "fs";

import { Command } from "../command";
import * as fsi from "../firestore/api";
import { logger } from "../logger";
import { requirePermissions } from "../requirePermissions";
import { Emulators } from "../emulator/types";
import { warnEmulatorNotSupported } from "../emulator/commandUtils";
import { FirestoreOptions } from "../firestore/options";
import { PrettyPrint } from "../firestore/pretty-print";
import * as utils from "../utils";

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
  .option(
    "-o, --output [filename]",
    "write indexes output to a file. if omitted, will use the path to specified database indexes file. (default) if none provided",
  )
  .before(requirePermissions, ["datastore.indexes.list"])
  .before(warnEmulatorNotSupported, Emulators.FIRESTORE)
  .action(async (options: FirestoreOptions) => {
    const indexApi = new fsi.FirestoreApi();
    const printer = new PrettyPrint();

    const databaseId = options.database ?? "(default)";
    const indexes = await indexApi.listIndexes(options.project, databaseId);
    const fieldOverrides = await indexApi.listFieldOverrides(options.project, databaseId);

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

    const fileOut = !!options.output;
    if (fileOut) {
      const shouldUseDefaultFilename = options.output === true || options.output === "";

      let filename = undefined;
      if (shouldUseDefaultFilename) {
        const fsConfig = options.config.src.firestore;
        if (fsConfig !== undefined) {
          // Check if single db
          if (!Array.isArray(fsConfig)) {
            filename = fsConfig.indexes;
          } else {
            const databaseId = options.database || `(default)`;
            filename = fsConfig.find((db) => db.database === databaseId)?.indexes;
          }
        } else {
          logger.debug("Possibly invalid database config: ", JSON.stringify(fsConfig));
        }
      } else {
        filename = options.output;
      }

      utils.assertIsString(filename);
      const indexTemplate = JSON.stringify(indexSpec, undefined, 2);
      fs.writeFileSync(filename, indexTemplate);
    }

    return indexSpec;
  });
