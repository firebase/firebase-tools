/**
 * Copyright (c) 2022 Google LLC
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of
 * this software and associated documentation files (the "Software"), to deal in
 * the Software without restriction, including without limitation the rights to
 * use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
 * the Software, and to permit persons to whom the Software is furnished to do so,
 * subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
 * FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
 * COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
 * IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
 * CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

import { Command } from "../command";
import * as clc from "cli-color";
import * as fsi from "../firestore/indexes";
import { logger } from "../logger";
import { requirePermissions } from "../requirePermissions";
import { Emulators } from "../emulator/types";
import { warnEmulatorNotSupported } from "../emulator/commandUtils";

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
